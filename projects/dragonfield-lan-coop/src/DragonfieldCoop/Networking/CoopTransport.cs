#nullable enable

using System;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using LiteNetLib;
using LiteNetLib.Utils;

namespace DragonfieldCoop.Networking;

public sealed class CoopNetworkConfig
{
    public int Port { get; init; } = CoopProtocol.DefaultPort;
    public string ConnectionKey { get; init; } = "Dragonfield-Alpha10-Coop";
    public string GameVersion { get; init; } = "Dragonfield-Alpha10";
    public string GameHash { get; init; } = string.Empty;
    public string ModVersion { get; init; } = "0.1.0";
    public string ModHash { get; init; } = string.Empty;
    public string HostName { get; init; } = Environment.MachineName;
    public int MaxPlayers { get; init; } = 2;
}

public interface ICoopNetworkCallbacks
{
    void OnStateChanged(ConnectionState state);
    void OnDiscovery(DiscoveryAdvertisement advertisement, IPEndPoint endpoint);
    void OnConnected(NetPeer peer, bool isHost);
    void OnReadyChanged(NetPeer peer, bool ready);
    void OnRejected(SessionReject rejection);
    void OnInput(NetPeer peer, InputFrame frame);
    void OnBootstrap(WorldBootstrap bootstrap);
    void OnSnapshots(NetPeer peer, ActorSnapshotBatch snapshots);
    void OnGameEvents(NetPeer peer, GameEventBatch events);
    void OnWorldState(NetPeer peer, WorldState state);
    void OnDisconnected(NetPeer? peer, DisconnectInfo info);
    void OnNetworkError(IPEndPoint endpoint, SocketError error);
}

public sealed class CoopNetworkTransport : INetEventListener, IDisposable
{
    private readonly CoopNetworkConfig _config;
    private readonly ICoopNetworkCallbacks _callbacks;
    private readonly NetManager _manager;
    private readonly Dictionary<int, NetPeer> _peers = new();
    private readonly Dictionary<int, uint> _lastInputSequence = new();
    private readonly Dictionary<int, bool> _peerReady = new();
    private ConnectionState _state = ConnectionState.Disconnected;
    private CoopRole _role = CoopRole.Solo;
    private uint _inputSequence;
    private uint _snapshotSequence;
    private uint _eventSequence;
    private uint _worldStateSequence;
    private uint _lastReceivedSnapshotSequence;
    private uint _lastReceivedEventSequence;
    private uint _lastReceivedWorldStateSequence;
    private long _nextInputTicks;
    private long _nextSnapshotTicks;
    private long _nextDiscoveryTicks;
    private NetPeer? _serverPeer;
    private bool _disposed;

    public CoopNetworkTransport(CoopNetworkConfig config, ICoopNetworkCallbacks callbacks)
    {
        _config = config ?? throw new ArgumentNullException(nameof(config));
        _callbacks = callbacks ?? throw new ArgumentNullException(nameof(callbacks));
        // We explicitly recycle each reader in the callbacks below. Keeping this
        // false avoids returning the same pooled reader twice on LiteNetLib 2.x.
        _manager = new NetManager(this)
        {
            AutoRecycle = false,
            UnconnectedMessagesEnabled = true,
            BroadcastReceiveEnabled = true
        };
    }

    public CoopRole Role => _role;
    public ConnectionState State => _state;
    public NetManager Manager => _manager;
    public IReadOnlyCollection<NetPeer> Peers => _peers.Values;
    public bool AllConnectedPeersReady => _peers.Count > 0 && _peers.Keys.All(id => _peerReady.TryGetValue(id, out var ready) && ready);

    public bool StartHost()
    {
        ThrowIfDisposed();
        StopInternal();
        if (!_manager.Start(_config.Port)) return false;
        _role = CoopRole.Host; SetState(ConnectionState.Ready); return true;
    }

    public bool StartClient()
    {
        ThrowIfDisposed();
        StopInternal();
        if (!_manager.Start()) return false;
        _role = CoopRole.Client; SetState(ConnectionState.Discovering); _nextDiscoveryTicks = 0; return true;
    }

    public void PollEvents() { if (!_disposed) _manager.PollEvents(); }

    /// <summary>Call each frame. Sends queued input at 30 Hz, snapshots at 20 Hz, and LAN discovery every second.</summary>
    public void Tick(InputFrame? localInput = null, ActorSnapshotBatch? hostSnapshot = null, long? nowTicks = null)
    {
        if (_disposed) return;
        PollEvents();
        var now = nowTicks ?? DateTime.UtcNow.Ticks;
        if (_role == CoopRole.Client && _state is ConnectionState.Discovering && now >= _nextDiscoveryTicks)
        {
            BroadcastDiscoveryQuery(); _nextDiscoveryTicks = now + TimeSpan.TicksPerSecond;
        }
        if (_role == CoopRole.Client && _serverPeer is not null && localInput.HasValue && now >= _nextInputTicks)
        {
            var input = localInput.Value with { Sequence = ++_inputSequence }; Send(_serverPeer, PacketKind.Input, PacketFlags.Sequenced, input.Serialize(), _inputSequence); _nextInputTicks = now + TimeSpan.TicksPerSecond / CoopProtocol.InputRate;
        }
        if (_role == CoopRole.Host && hostSnapshot.HasValue && now >= _nextSnapshotTicks)
        {
            // A normal 40-vs-40 battle snapshot is roughly 4.6 KB. LiteNetLib's
            // sequenced datagram path is capped near one MTU (1,020 bytes), so use
            // reliable ordered delivery here to enable fragmentation. The envelope
            // sequence still lets clients reject stale snapshots.
            Broadcast(PacketKind.Snapshot, PacketFlags.Reliable | PacketFlags.Sequenced, hostSnapshot.Value.Serialize(), ++_snapshotSequence);
            _nextSnapshotTicks = now + TimeSpan.TicksPerSecond / CoopProtocol.SnapshotRate;
        }
    }

    public void DiscoverHosts() { if (_role == CoopRole.Client) BroadcastDiscoveryQuery(); }

    public bool Connect(string localAddress)
    {
        if (_role != CoopRole.Client || !IPAddress.TryParse(localAddress, out var parsed) || parsed.AddressFamily != AddressFamily.InterNetwork) return false;
        SetState(ConnectionState.Connecting);
        _serverPeer = _manager.Connect(localAddress, _config.Port, _config.ConnectionKey);
        if (_serverPeer is not null) return true;
        SetState(ConnectionState.Disconnected);
        return false;
    }

    public void ConfirmReady(bool ready)
    {
        if (_serverPeer is not null && (_state is ConnectionState.Ready or ConnectionState.InBattle)) Send(_serverPeer, PacketKind.Ready, PacketFlags.Reliable, new ReadyState(ready).Serialize(), 0);
    }

    public void SendHello(NetPeer peer)
    {
        var hello = new SessionHello(_config.GameVersion, _config.GameHash, _config.ModVersion, _config.ModHash, 0);
        Send(peer, PacketKind.Hello, PacketFlags.Reliable, hello.Serialize(), 0);
    }

    public void SendBootstrap(NetPeer peer, WorldBootstrap bootstrap) => Send(peer, PacketKind.WorldBootstrap, PacketFlags.Reliable, bootstrap.Serialize(), 0);
    public void BroadcastBootstrap(WorldBootstrap bootstrap) => Broadcast(PacketKind.WorldBootstrap, PacketFlags.Reliable, bootstrap.Serialize(), 0);
    public void BeginBattle(WorldBootstrap bootstrap)
    {
        if (_role != CoopRole.Host) throw new InvalidOperationException("Only the host can begin an authoritative battle.");
        if (!AllConnectedPeersReady) throw new InvalidOperationException("The joining player must connect and confirm Ready before deployment.");
        BroadcastBootstrap(bootstrap);
        SetState(ConnectionState.InBattle);
    }
    public void SendGameEvents(IEnumerable<GameEvent> events) => Broadcast(PacketKind.GameEvent, PacketFlags.Reliable, new GameEventBatch(new List<GameEvent>(events)).Serialize(), ++_eventSequence);
    public void SendWorldState(WorldState state) => Broadcast(PacketKind.WorldState, PacketFlags.Reliable, state.Serialize(), ++_worldStateSequence);
    public void Disconnect(string reason = "Closed by host") { if (_role == CoopRole.Host) Broadcast(PacketKind.Disconnect, PacketFlags.Reliable, new SessionReject(RejectReason.Unknown, reason).Serialize(), 0); Stop(); }

    public void Stop() { if (!_disposed) StopInternal(); }
    public void Dispose() { if (_disposed) return; StopInternal(); _disposed = true; }

    private void BroadcastDiscoveryQuery()
    {
        var packet = PacketEnvelope.Encode(PacketKind.DiscoveryQuery, PacketFlags.Reliable, 0, new DiscoveryQuery(_config.GameHash, _config.ModVersion).Serialize());
        // LiteNetLib's broadcast API enables the required socket behavior and
        // covers the generic broadcast route. Windows can still discard
        // 255.255.255.255 on Wi-Fi, so also send to each active adapter's
        // subnet-specific broadcast address (for example 192.168.1.255).
        _manager.SendBroadcast(packet, _config.Port);
        foreach (var endpoint in GetLanBroadcastEndpoints(_config.Port))
            _manager.SendUnconnectedMessage(packet, endpoint);
    }

    private static IEnumerable<IPEndPoint> GetLanBroadcastEndpoints(int port)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var adapter in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (adapter.OperationalStatus != OperationalStatus.Up ||
                adapter.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel)
                continue;

            foreach (var address in adapter.GetIPProperties().UnicastAddresses)
            {
                if (address.Address.AddressFamily != AddressFamily.InterNetwork || address.IPv4Mask is null)
                    continue;

                var ip = address.Address.GetAddressBytes();
                var mask = address.IPv4Mask.GetAddressBytes();
                if (ip.Length != 4 || mask.Length != 4) continue;
                var broadcast = new byte[4];
                for (var index = 0; index < 4; index++) broadcast[index] = (byte)(ip[index] | ~mask[index]);
                var value = new IPAddress(broadcast).ToString();
                if (seen.Add(value)) yield return new IPEndPoint(IPAddress.Parse(value), port);
            }
        }
    }

    private void Send(NetPeer peer, PacketKind kind, PacketFlags flags, byte[] payload, uint sequence)
    {
        var writer = new NetDataWriter(); writer.Put(PacketEnvelope.Encode(kind, flags, sequence, payload));
        peer.Send(writer, flags.HasFlag(PacketFlags.Reliable) ? DeliveryMethod.ReliableOrdered : DeliveryMethod.Sequenced);
    }

    private void Broadcast(PacketKind kind, PacketFlags flags, byte[] payload, uint sequence)
    {
        var writer = new NetDataWriter(); writer.Put(PacketEnvelope.Encode(kind, flags, sequence, payload));
        _manager.SendToAll(writer, 0, flags.HasFlag(PacketFlags.Reliable) ? DeliveryMethod.ReliableOrdered : DeliveryMethod.Sequenced);
    }

    private void SetState(ConnectionState state) { if (_state == state) return; _state = state; _callbacks.OnStateChanged(state); }
    private void StopInternal()
    {
        _manager.Stop();
        _peers.Clear();
        _lastInputSequence.Clear();
        _peerReady.Clear();
        _serverPeer = null;
        _inputSequence = 0;
        _snapshotSequence = 0;
        _eventSequence = 0;
        _worldStateSequence = 0;
        _lastReceivedSnapshotSequence = 0;
        _lastReceivedEventSequence = 0;
        _lastReceivedWorldStateSequence = 0;
        _nextInputTicks = 0;
        _nextSnapshotTicks = 0;
        _nextDiscoveryTicks = 0;
        _role = CoopRole.Solo;
        SetState(ConnectionState.Disconnected);
    }
    private void ThrowIfDisposed() { if (_disposed) throw new ObjectDisposedException(nameof(CoopNetworkTransport)); }

    public void OnPeerConnected(NetPeer peer)
    {
        _peers[peer.Id] = peer; _peerReady[peer.Id] = false;
        if (_role == CoopRole.Client) { _serverPeer = peer; SetState(ConnectionState.Connecting); SendHello(peer); }
        _callbacks.OnConnected(peer, _role == CoopRole.Host);
    }

    public void OnPeerDisconnected(NetPeer peer, DisconnectInfo disconnectInfo)
    {
        _peers.Remove(peer.Id); _lastInputSequence.Remove(peer.Id); _peerReady.Remove(peer.Id); if (_serverPeer == peer) _serverPeer = null; if (_role == CoopRole.Client) SetState(ConnectionState.Disconnected); _callbacks.OnDisconnected(peer, disconnectInfo);
    }

    public void OnNetworkError(IPEndPoint endPoint, SocketError socketError) => _callbacks.OnNetworkError(endPoint, socketError);
    public void OnNetworkLatencyUpdate(NetPeer peer, int latency) { }

    public void OnConnectionRequest(ConnectionRequest request)
    {
        if (_role != CoopRole.Host || _peers.Count >= Math.Max(1, _config.MaxPlayers - 1)) { request.Reject(); return; }
        request.AcceptIfKey(_config.ConnectionKey);
    }

    public void OnNetworkReceive(NetPeer peer, NetPacketReader reader, byte channelNumber, DeliveryMethod deliveryMethod)
    {
        try
        {
            if (!PacketEnvelope.TryDecode(reader.GetRemainingBytes(), out var packet)) return;
            switch (packet.Kind)
            {
                case PacketKind.Hello: HandleHello(peer, packet.Payload); break;
                case PacketKind.Accept: HandleAccept(packet.Payload); break;
                case PacketKind.Ready: HandleReady(peer, packet.Payload); break;
                case PacketKind.Input: HandleInput(peer, packet); break;
                case PacketKind.WorldBootstrap: if (WorldBootstrap.TryDeserialize(packet.Payload, out var bootstrap)) { SetState(ConnectionState.InBattle); _callbacks.OnBootstrap(bootstrap); } break;
                case PacketKind.Snapshot: if (packet.Sequence > _lastReceivedSnapshotSequence && ActorSnapshotBatch.TryDeserialize(packet.Payload, out var snapshots)) { _lastReceivedSnapshotSequence = packet.Sequence; _callbacks.OnSnapshots(peer, snapshots); } break;
                case PacketKind.GameEvent: if (packet.Sequence > _lastReceivedEventSequence && GameEventBatch.TryDeserialize(packet.Payload, out var events)) { _lastReceivedEventSequence = packet.Sequence; _callbacks.OnGameEvents(peer, events); } break;
                case PacketKind.WorldState: if (packet.Sequence > _lastReceivedWorldStateSequence && WorldState.TryDeserialize(packet.Payload, out var worldState)) { _lastReceivedWorldStateSequence = packet.Sequence; _callbacks.OnWorldState(peer, worldState); } break;
                case PacketKind.Reject: if (SessionReject.TryDeserialize(packet.Payload, out var rejection)) { SetState(ConnectionState.Disconnected); _callbacks.OnRejected(rejection); } break;
                case PacketKind.Disconnect: if (SessionReject.TryDeserialize(packet.Payload, out var closed)) _callbacks.OnRejected(closed); peer.Disconnect(); break;
            }
        }
        finally { reader.Recycle(); }
    }

    private void HandleHello(NetPeer peer, byte[] payload)
    {
        if (_role != CoopRole.Host || !SessionHello.TryDeserialize(payload, out var hello)) { Reject(peer, RejectReason.InvalidHello, "Invalid handshake."); return; }
        if (_state == ConnectionState.InBattle) { Reject(peer, RejectReason.BattleAlreadyStarted, "The battle has already started. Rejoin before the next deployment."); return; }
        if (hello.GameVersion != _config.GameVersion || (!string.IsNullOrWhiteSpace(_config.GameHash) && hello.GameHash != _config.GameHash)) { Reject(peer, RejectReason.GameVersionMismatch, "Game build does not match host."); return; }
        if (hello.ModVersion != _config.ModVersion || (!string.IsNullOrWhiteSpace(_config.ModHash) && hello.ModHash != _config.ModHash)) { Reject(peer, RejectReason.ModVersionMismatch, "Co-op mod version does not match host."); return; }
        Send(peer, PacketKind.Accept, PacketFlags.Reliable, new SessionAccept(2, 0, string.Empty, DateTime.UtcNow.Ticks).Serialize(), 0); SetState(ConnectionState.Ready);
    }

    private void HandleAccept(byte[] payload)
    {
        if (_role == CoopRole.Client && SessionAccept.TryDeserialize(payload, out _)) SetState(ConnectionState.Ready);
    }

    private void HandleReady(NetPeer peer, byte[] payload)
    {
        if (_role != CoopRole.Host || !ReadyState.TryDeserialize(payload, out var ready)) return;
        _peerReady[peer.Id] = ready.Ready;
        _callbacks.OnReadyChanged(peer, ready.Ready);
    }
    private void HandleInput(NetPeer peer, PacketEnvelope packet)
    {
        if (_role != CoopRole.Host || !InputFrame.TryDeserialize(packet.Payload, out var input)) return;
        if (_lastInputSequence.TryGetValue(peer.Id, out var previous) && input.Sequence <= previous) return;
        input = input with
        {
            MoveX = ClampFinite(input.MoveX, -1f, 1f), MoveY = ClampFinite(input.MoveY, -1f, 1f),
            LookYaw = ClampFinite(input.LookYaw, -360f, 360f), LookPitch = ClampFinite(input.LookPitch, -89f, 89f),
            EquipmentSlot = (byte)Math.Clamp(input.EquipmentSlot, (byte)1, (byte)5), BowCharge = ClampFinite(input.BowCharge, 0f, 1f)
        };
        _lastInputSequence[peer.Id] = input.Sequence; _callbacks.OnInput(peer, input);
    }
    private static float ClampFinite(float value, float min, float max) => float.IsFinite(value) ? Math.Clamp(value, min, max) : 0f;
    private void Reject(NetPeer peer, RejectReason reason, string message) { Send(peer, PacketKind.Reject, PacketFlags.Reliable, new SessionReject(reason, message).Serialize(), 0); peer.Disconnect(); _callbacks.OnRejected(new SessionReject(reason, message)); }

    public void OnNetworkReceiveUnconnected(IPEndPoint remoteEndPoint, NetPacketReader reader, UnconnectedMessageType messageType)
    {
        try
        {
            if (!PacketEnvelope.TryDecode(reader.GetRemainingBytes(), out var packet)) return;
            // Always advertise a valid host on the LAN. Compatibility is enforced by
            // the Hello handshake, which gives the joining player an explicit error.
            // Silently ignoring old builds here made version mismatches look like a
            // firewall or Wi-Fi failure.
            if (packet.Kind == PacketKind.DiscoveryQuery && _role == CoopRole.Host && DiscoveryQuery.TryDeserialize(packet.Payload, out _))
            {
                var writer = new NetDataWriter(); writer.Put(PacketEnvelope.Encode(PacketKind.DiscoveryAdvertisement, PacketFlags.Reliable, 0, new DiscoveryAdvertisement(_config.HostName, string.Empty, _state == ConnectionState.InBattle, _peers.Count + 1, _config.MaxPlayers, DateTime.UtcNow.Ticks).Serialize())); _manager.SendUnconnectedMessage(writer, remoteEndPoint);
            }
            else if (packet.Kind == PacketKind.DiscoveryAdvertisement && _role == CoopRole.Client && DiscoveryAdvertisement.TryDeserialize(packet.Payload, out var advert)) _callbacks.OnDiscovery(advert, remoteEndPoint);
        }
        finally { reader.Recycle(); }
    }
}
