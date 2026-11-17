using System.Net;
using System.Numerics;
using DragonfieldCoop.Networking;
using LiteNetLib;
using CoopConnectionState = DragonfieldCoop.Networking.ConnectionState;

static class Check
{
    public static void True(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    public static void Equal<T>(T a, T b, string message) where T : notnull => True(EqualityComparer<T>.Default.Equals(a, b), $"{message}: {a} != {b}");
}

sealed class Callbacks : ICoopNetworkCallbacks
{
    public readonly List<string> Rejections = new();
    public readonly List<InputFrame> Inputs = new();
    public readonly List<bool> Ready = new();
    public readonly List<ActorSnapshotBatch> Snapshots = new();
    public readonly List<(DiscoveryAdvertisement Advertisement, IPEndPoint Endpoint)> Discoveries = new();
    public readonly List<CoopConnectionState> States = new();
    public CoopConnectionState State;
    public void OnStateChanged(CoopConnectionState state) { State = state; States.Add(state); }
    public void OnDiscovery(DiscoveryAdvertisement a, IPEndPoint e) => Discoveries.Add((a, e));
    public void OnConnected(NetPeer p, bool h) { }
    public void OnReadyChanged(NetPeer p, bool ready) => Ready.Add(ready);
    public void OnRejected(SessionReject r) => Rejections.Add($"{r.Reason}:{r.Message}");
    public void OnInput(NetPeer p, InputFrame f) => Inputs.Add(f);
    public void OnBootstrap(WorldBootstrap b) { }
    public void OnSnapshots(NetPeer p, ActorSnapshotBatch s) => Snapshots.Add(s);
    public void OnGameEvents(NetPeer p, GameEventBatch e) { }
    public void OnWorldState(NetPeer p, WorldState state) { }
    public void OnDisconnected(NetPeer? p, DisconnectInfo i) { }
    public void OnNetworkError(IPEndPoint e, System.Net.Sockets.SocketError s) { }
}

static class Program
{
    static ActorSnapshot Actor(int id) => new(id, 0, new NetVector3(id, 1, -id), new NetQuaternion(0, 0, 0, 1), new NetVector3(1, 2, 3), 4, 2, 87.5f, 9);

    static void RoundTrips()
    {
        var input = new InputFrame(42, -.25f, .75f, 1.2f, -.4f, ActionBits.Attack | ActionBits.Block, 3, true, .88f);
        Check.True(InputFrame.TryDeserialize(input.Serialize(), out var decodedInput), "InputFrame decode");
        Check.Equal(input, decodedInput, "InputFrame round-trip");

        var actors = Enumerable.Range(1, 3).Select(Actor).ToArray();
        var batch = new ActorSnapshotBatch(91, actors);
        Check.True(ActorSnapshotBatch.TryDeserialize(batch.Serialize(), out var decodedBatch), "ActorSnapshotBatch decode");
        Check.Equal(batch.ServerTick, decodedBatch.ServerTick, "snapshot tick"); Check.Equal(batch.Actors.Count, decodedBatch.Actors.Count, "snapshot count");
        Check.Equal(batch.Actors[2], decodedBatch.Actors[2], "snapshot actor");

        var world = new WorldBootstrap("Island", 0, 77, 1, 800, 701,
            new[] { new ObjectiveState("A", 0, .5f, true), new ObjectiveState("B", 1, 1, false) }, actors);
        Check.True(WorldBootstrap.TryDeserialize(world.Serialize(), out var decodedWorld), "WorldBootstrap decode");
        Check.Equal(world.MapId, decodedWorld.MapId, "world map"); Check.Equal(world.Objectives.Count, decodedWorld.Objectives.Count, "world objectives");
        Check.Equal(world.Actors.Count, decodedWorld.Actors.Count, "world actors");

        var state = new WorldState(8, 720, 699, false, byte.MaxValue, world.Objectives);
        Check.True(WorldState.TryDeserialize(state.Serialize(), out var decodedState), "WorldState decode");
        Check.Equal(state.Sequence, decodedState.Sequence, "world-state sequence");
        Check.Equal(state.TideScore, decodedState.TideScore, "world-state score");
        Check.Equal(state.Objectives.Count, decodedState.Objectives.Count, "world-state objectives");

        var events = new GameEventBatch(new[] { new GameEvent(EventKind.Combat, 5, 1, 2, 20, NetVector3.From(new Vector3(1, 2, 3)), 9, "head") });
        Check.True(GameEventBatch.TryDeserialize(events.Serialize(), out var decodedEvents), "GameEventBatch decode");
        Check.Equal(events.Events[0], decodedEvents.Events[0], "event round-trip");

        Check.True(!InputFrame.TryDeserialize(input.Serialize().Concat(new byte[] { 0 }).ToArray(), out _), "trailing bytes rejected");
        var malformedEnvelope = PacketEnvelope.Encode(PacketKind.Input, PacketFlags.Reliable, 1, new byte[] { 1, 2 });
        Check.True(PacketEnvelope.TryDecode(malformedEnvelope, out _), "valid envelope");
        malformedEnvelope[12] = 0xff; Check.True(!PacketEnvelope.TryDecode(malformedEnvelope, out _), "bad envelope length rejected");
        var tooMany = new ActorSnapshotBatch(1, Enumerable.Range(0, CoopProtocol.MaxActorsPerSnapshot + 1).Select(Actor).ToArray());
        Check.True(ActorSnapshotBatch.TryDeserialize(tooMany.Serialize(), out var capped) && capped.Actors.Count == CoopProtocol.MaxActorsPerSnapshot, "snapshot cap");
        Console.WriteLine("PASS serialization, caps, trailing-byte and envelope bounds");
    }

    static void LanHandshake()
    {
        var port = 28000 + Random.Shared.Next(500);
        var hostCb = new Callbacks(); var goodCb = new Callbacks(); var badCb = new Callbacks();
        using var host = new CoopNetworkTransport(new CoopNetworkConfig { Port = port, GameHash = "game", ModHash = "mod", MaxPlayers = 3 }, hostCb);
        using var good = new CoopNetworkTransport(new CoopNetworkConfig { Port = port, GameHash = "game", ModHash = "mod" }, goodCb);
        using var bad = new CoopNetworkTransport(new CoopNetworkConfig { Port = port, GameHash = "wrong", ModHash = "mod" }, badCb);
        Check.True(host.StartHost(), "host start"); Check.True(good.StartClient(), "client start"); Check.True(good.Connect("127.0.0.1"), "good connect");
        for (var i = 0; i < 100 && goodCb.State != CoopConnectionState.Ready; i++) { host.Tick(nowTicks: DateTime.UtcNow.Ticks); good.Tick(nowTicks: DateTime.UtcNow.Ticks); Thread.Sleep(10); }
        Check.Equal(CoopConnectionState.Ready, goodCb.State, "matching client accepted");
        good.ConfirmReady(true);
        for (var i = 0; i < 100 && !host.AllConnectedPeersReady; i++) { host.Tick(nowTicks: DateTime.UtcNow.Ticks); good.Tick(nowTicks: DateTime.UtcNow.Ticks); Thread.Sleep(10); }
        Check.True(host.AllConnectedPeersReady && hostCb.Ready.Contains(true), "host records per-peer Ready");
        good.Stop();
        Check.True(bad.StartClient(), "bad client start"); Check.True(bad.Connect("127.0.0.1"), "bad connect");
        for (var i = 0; i < 100 && badCb.Rejections.Count == 0; i++) { host.Tick(nowTicks: DateTime.UtcNow.Ticks); bad.Tick(nowTicks: DateTime.UtcNow.Ticks); Thread.Sleep(10); }
        Check.True(badCb.Rejections.Any(x => x.StartsWith("GameVersionMismatch", StringComparison.Ordinal)) || hostCb.Rejections.Any(x => x.StartsWith("GameVersionMismatch", StringComparison.Ordinal)), $"mismatch rejected (client={string.Join("|", badCb.Rejections)} host={string.Join("|", hostCb.Rejections)})");
        Console.WriteLine("PASS localhost LiteNetLib handshake and game-version mismatch rejection");
    }

    static void LanDiscovery()
    {
        var port = 28600 + Random.Shared.Next(300);
        var hostCb = new Callbacks();
        var clientCb = new Callbacks();
        using var host = new CoopNetworkTransport(new CoopNetworkConfig
        {
            Port = port,
            GameHash = "game",
            ModVersion = "current",
            HostName = "HarnessHost"
        }, hostCb);
        using var client = new CoopNetworkTransport(new CoopNetworkConfig
        {
            Port = port,
            GameHash = "different-game",
            ModVersion = "older-client"
        }, clientCb);

        Check.True(host.StartHost(), "discovery host start");
        Check.True(client.StartClient(), "discovery client start");
        Check.True(host.Manager.BroadcastReceiveEnabled, "host broadcast reception enabled");
        Check.True(client.Manager.BroadcastReceiveEnabled, "client broadcast reception enabled");
        client.DiscoverHosts();
        for (var i = 0; i < 200 && clientCb.Discoveries.Count == 0; i++)
        {
            host.Tick(nowTicks: DateTime.UtcNow.Ticks);
            client.Tick(nowTicks: DateTime.UtcNow.Ticks);
            Thread.Sleep(10);
        }

        Check.True(clientCb.Discoveries.Count > 0, "LAN broadcast advertisement received");
        Check.Equal("HarnessHost", clientCb.Discoveries[0].Advertisement.HostName, "discovered host name");
        Check.True(client.Connect(clientCb.Discoveries[0].Endpoint.Address.ToString()), "connect to discovered endpoint");
        for (var i = 0; i < 150 && clientCb.Rejections.Count == 0; i++)
        {
            host.Tick(nowTicks: DateTime.UtcNow.Ticks);
            client.Tick(nowTicks: DateTime.UtcNow.Ticks);
            Thread.Sleep(10);
        }
        Check.True(clientCb.Rejections.Any(x => x.StartsWith("GameVersionMismatch", StringComparison.Ordinal)) ||
                   hostCb.Rejections.Any(x => x.StartsWith("GameVersionMismatch", StringComparison.Ordinal)),
            "incompatible discovered host gives explicit handshake rejection");
        Console.WriteLine("PASS LAN broadcast discovery and explicit compatibility rejection");
    }

    static void LargeSnapshotDelivery()
    {
        var port = 28900 + Random.Shared.Next(300);
        var hostCb = new Callbacks(); var clientCb = new Callbacks();
        using var host = new CoopNetworkTransport(new CoopNetworkConfig { Port = port, GameHash = "game", ModHash = "mod" }, hostCb);
        using var client = new CoopNetworkTransport(new CoopNetworkConfig { Port = port, GameHash = "game", ModHash = "mod" }, clientCb);
        Check.True(host.StartHost(), "snapshot host start");
        Check.True(client.StartClient(), "snapshot client start");
        Check.True(client.Connect("127.0.0.1"), "snapshot client connect");
        for (var i = 0; i < 100 && clientCb.State != CoopConnectionState.Ready; i++)
        {
            host.Tick(nowTicks: DateTime.UtcNow.Ticks); client.Tick(nowTicks: DateTime.UtcNow.Ticks); Thread.Sleep(10);
        }
        Check.Equal(CoopConnectionState.Ready, clientCb.State, "snapshot client accepted");
        client.ConfirmReady(true);
        for (var i = 0; i < 100 && !host.AllConnectedPeersReady; i++)
        {
            host.Tick(nowTicks: DateTime.UtcNow.Ticks); client.Tick(nowTicks: DateTime.UtcNow.Ticks); Thread.Sleep(10);
        }
        var actors = Enumerable.Range(1, 82).Select(Actor).ToArray();
        var bootstrap = new WorldBootstrap("Shorebreak", 0, 2, 0, 750, 750, Array.Empty<ObjectiveState>(), actors);
        host.BeginBattle(bootstrap);
        var snapshot = new ActorSnapshotBatch(1, actors);
        for (var i = 0; i < 200 && clientCb.Snapshots.Count == 0; i++)
        {
            host.Tick(hostSnapshot: snapshot, nowTicks: DateTime.UtcNow.Ticks);
            client.Tick(nowTicks: DateTime.UtcNow.Ticks);
            Thread.Sleep(10);
        }
        Check.True(clientCb.Snapshots.Count > 0, "large actor snapshot delivered");
        Check.Equal(actors.Length, clientCb.Snapshots[0].Actors.Count, "large actor snapshot count");
        Console.WriteLine($"PASS large sequenced snapshot delivery ({snapshot.Serialize().Length} payload bytes, {actors.Length} actors)");

        client.Stop();
        host.Stop();
        Check.True(host.StartHost(), "reconnect host restart");
        Check.True(client.StartClient(), "reconnect client restart");
        Check.True(client.Connect("127.0.0.1"), "reconnect client connect");
        for (var i = 0; i < 100 && clientCb.State != CoopConnectionState.Ready; i++)
        {
            host.Tick(nowTicks: DateTime.UtcNow.Ticks); client.Tick(nowTicks: DateTime.UtcNow.Ticks); Thread.Sleep(10);
        }
        Check.Equal(CoopConnectionState.Ready, clientCb.State, "fresh handshake after transport restart");
        Console.WriteLine("PASS disconnect and fresh-session reconnect");
    }

    public static int Main()
    {
        try { RoundTrips(); LanHandshake(); LanDiscovery(); LargeSnapshotDelivery(); Console.WriteLine("ALL PROTOCOL HARNESS TESTS PASSED"); return 0; }
        catch (Exception ex) { Console.Error.WriteLine("FAIL: " + ex.Message); return 1; }
    }
}
