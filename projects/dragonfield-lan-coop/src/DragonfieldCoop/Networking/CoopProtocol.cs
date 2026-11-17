#nullable enable

using System;
using System.Collections.Generic;
using System.IO;
using System.Numerics;
using System.Text;

namespace DragonfieldCoop.Networking;

/// <summary>Wire protocol version. Increment when an incompatible packet layout changes.</summary>
public static class CoopProtocol
{
    public const int Magic = 0x4446434F; // DFCO
    public const byte Version = 2;
    public const int DefaultPort = 27015;
    public const int InputRate = 30;
    public const int SnapshotRate = 20;
    public const int InterpolationDelayMs = 100;
    public const int MaxActorsPerSnapshot = 256;
    public const int MaxEventsPerPacket = 128;
}

public enum CoopRole : byte { Solo, Host, Client }
public enum ConnectionState : byte { Disconnected, Discovering, Connecting, Ready, InBattle }
public enum PacketKind : byte
{
    DiscoveryQuery = 1,
    DiscoveryAdvertisement = 2,
    Hello = 3,
    Accept = 4,
    Reject = 5,
    Ready = 6,
    WorldBootstrap = 7,
    Input = 8,
    Snapshot = 9,
    GameEvent = 10,
    Disconnect = 11,
    Ping = 12,
    Pong = 13,
    WorldState = 14,
}

public enum PacketFlags : byte { None = 0, Reliable = 1, Sequenced = 2 }
public enum RejectReason : byte { Unknown = 0, ProtocolMismatch, GameVersionMismatch, ModVersionMismatch, BattleAlreadyStarted, Full, InvalidHello }
public enum EventKind : byte { Combat, Projectile, Interaction, Physics, Objective, Respawn, Match, Pickup, Vehicle }
public enum ActionBits : ushort { None = 0, Attack = 1, HeavyAttack = 2, Block = 4, Kick = 8, Jump = 16, Crouch = 32, Interact = 64, Fire = 128, Reload = 256, Use = 512, EnterVehicle = 1024, Sprint = 2048 }

public readonly record struct NetVector3(float X, float Y, float Z)
{
    public static NetVector3 From(Vector3 value) => new(value.X, value.Y, value.Z);
    public Vector3 ToNumerics() => new(X, Y, Z);
}

public readonly record struct NetQuaternion(float X, float Y, float Z, float W)
{
    public static NetQuaternion From(Quaternion value) => new(value.X, value.Y, value.Z, value.W);
    public Quaternion ToNumerics() => new(X, Y, Z, W);
}

public readonly record struct PacketEnvelope(PacketKind Kind, PacketFlags Flags, uint Sequence, byte[] Payload)
{
    public static byte[] Encode(PacketKind kind, PacketFlags flags, uint sequence, ReadOnlySpan<byte> payload)
    {
        using var stream = new MemoryStream(16 + payload.Length);
        using var writer = new BinaryWriter(stream, Encoding.UTF8, true);
        writer.Write(CoopProtocol.Magic);
        writer.Write(CoopProtocol.Version);
        writer.Write((byte)kind);
        writer.Write((byte)flags);
        writer.Write(sequence);
        writer.Write(payload.Length);
        writer.Write(payload);
        writer.Flush();
        return stream.ToArray();
    }

    public static bool TryDecode(ReadOnlySpan<byte> data, out PacketEnvelope packet)
    {
        packet = default;
        try
        {
            using var stream = new MemoryStream(data.ToArray(), false);
            using var reader = new BinaryReader(stream, Encoding.UTF8, true);
            if (reader.ReadInt32() != CoopProtocol.Magic || reader.ReadByte() != CoopProtocol.Version)
                return false;
            var kind = (PacketKind)reader.ReadByte();
            var flags = (PacketFlags)reader.ReadByte();
            var sequence = reader.ReadUInt32();
            var length = reader.ReadInt32();
            if (length < 0 || length > 1024 * 1024 || length > stream.Length - stream.Position) return false;
            var payload = reader.ReadBytes(length);
            if (payload.Length != length) return false;
            packet = new PacketEnvelope(kind, flags, sequence, payload);
            return true;
        }
        catch (EndOfStreamException) { return false; }
        catch (IOException) { return false; }
    }
}

public readonly record struct SessionHello(string GameVersion, string GameHash, string ModVersion, string ModHash, byte TeamId)
{
    public byte[] Serialize()
    {
        var self = this;
        return Wire.Serialize(writer =>
        {
            Wire.WriteString(writer, self.GameVersion);
            Wire.WriteString(writer, self.GameHash);
            Wire.WriteString(writer, self.ModVersion);
            Wire.WriteString(writer, self.ModHash);
            writer.Write(self.TeamId);
        });
    }

    public static bool TryDeserialize(ReadOnlySpan<byte> data, out SessionHello value) => Wire.TryDeserialize(data, reader => new SessionHello(
        Wire.ReadString(reader), Wire.ReadString(reader), Wire.ReadString(reader), Wire.ReadString(reader), reader.ReadByte()), out value);
}

public readonly record struct SessionAccept(int PlayerNetworkId, byte TeamId, string MapId, long SessionId)
{
    public byte[] Serialize() { var self = this; return Wire.Serialize(writer => { writer.Write(self.PlayerNetworkId); writer.Write(self.TeamId); Wire.WriteString(writer, self.MapId); writer.Write(self.SessionId); }); }
    public static bool TryDeserialize(ReadOnlySpan<byte> data, out SessionAccept value) => Wire.TryDeserialize(data, reader => new SessionAccept(reader.ReadInt32(), reader.ReadByte(), Wire.ReadString(reader), reader.ReadInt64()), out value);
}

public readonly record struct SessionReject(RejectReason Reason, string Message)
{
    public byte[] Serialize() { var self = this; return Wire.Serialize(writer => { writer.Write((byte)self.Reason); Wire.WriteString(writer, self.Message); }); }
    public static bool TryDeserialize(ReadOnlySpan<byte> data, out SessionReject value) => Wire.TryDeserialize(data, reader => new SessionReject((RejectReason)reader.ReadByte(), Wire.ReadString(reader)), out value);
}

public readonly record struct ReadyState(bool Ready)
{
    public byte[] Serialize() { var self = this; return Wire.Serialize(writer => writer.Write(self.Ready)); }
    public static bool TryDeserialize(ReadOnlySpan<byte> data, out ReadyState value) => Wire.TryDeserialize(data, reader => new ReadyState(reader.ReadBoolean()), out value);
}

public readonly record struct DiscoveryQuery(string GameHash, string ModVersion)
{
    public byte[] Serialize() { var self = this; return Wire.Serialize(writer => { Wire.WriteString(writer, self.GameHash); Wire.WriteString(writer, self.ModVersion); }); }
    public static bool TryDeserialize(ReadOnlySpan<byte> data, out DiscoveryQuery value) => Wire.TryDeserialize(data, reader => new DiscoveryQuery(Wire.ReadString(reader), Wire.ReadString(reader)), out value);
}

public readonly record struct DiscoveryAdvertisement(string HostName, string MapId, bool BattleStarted, int PlayerCount, int MaxPlayers, long SessionId)
{
    public byte[] Serialize() { var self = this; return Wire.Serialize(writer => { Wire.WriteString(writer, self.HostName); Wire.WriteString(writer, self.MapId); writer.Write(self.BattleStarted); writer.Write(self.PlayerCount); writer.Write(self.MaxPlayers); writer.Write(self.SessionId); }); }
    public static bool TryDeserialize(ReadOnlySpan<byte> data, out DiscoveryAdvertisement value) => Wire.TryDeserialize(data, reader => new DiscoveryAdvertisement(Wire.ReadString(reader), Wire.ReadString(reader), reader.ReadBoolean(), reader.ReadInt32(), reader.ReadInt32(), reader.ReadInt64()), out value);
}

public readonly record struct InputFrame(uint Sequence, float MoveX, float MoveY, float LookYaw, float LookPitch, ActionBits Actions, byte EquipmentSlot, bool BowHeld, float BowCharge)
{
    public byte[] Serialize() { var self = this; return Wire.Serialize(writer => { writer.Write(self.Sequence); writer.Write(self.MoveX); writer.Write(self.MoveY); writer.Write(self.LookYaw); writer.Write(self.LookPitch); writer.Write((ushort)self.Actions); writer.Write(self.EquipmentSlot); writer.Write(self.BowHeld); writer.Write(self.BowCharge); }); }
    public static bool TryDeserialize(ReadOnlySpan<byte> data, out InputFrame value) => Wire.TryDeserialize(data, reader => new InputFrame(reader.ReadUInt32(), reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle(), (ActionBits)reader.ReadUInt16(), reader.ReadByte(), reader.ReadBoolean(), reader.ReadSingle()), out value);
}

public readonly record struct ActorSnapshot(int NetworkId, byte TeamId, NetVector3 Position, NetQuaternion Rotation, NetVector3 Velocity, int AnimationState, byte EquipmentSlot, float Health, ushort StateBits)
{
    public void Write(BinaryWriter writer)
    {
        writer.Write(NetworkId); writer.Write(TeamId); Wire.WriteVector(writer, Position); Wire.WriteQuaternion(writer, Rotation); Wire.WriteVector(writer, Velocity);
        writer.Write(AnimationState); writer.Write(EquipmentSlot); writer.Write(Health); writer.Write(StateBits);
    }

    public static ActorSnapshot Read(BinaryReader reader) => new(reader.ReadInt32(), reader.ReadByte(), Wire.ReadVector(reader), Wire.ReadQuaternion(reader), Wire.ReadVector(reader), reader.ReadInt32(), reader.ReadByte(), reader.ReadSingle(), reader.ReadUInt16());
}

public readonly record struct ActorSnapshotBatch(uint ServerTick, IReadOnlyList<ActorSnapshot> Actors)
{
    public byte[] Serialize() { var self = this; return Wire.Serialize(writer => { writer.Write(self.ServerTick); writer.Write((ushort)Math.Min(self.Actors.Count, CoopProtocol.MaxActorsPerSnapshot)); for (var i = 0; i < self.Actors.Count && i < CoopProtocol.MaxActorsPerSnapshot; i++) self.Actors[i].Write(writer); }); }
    public static bool TryDeserialize(ReadOnlySpan<byte> data, out ActorSnapshotBatch value) => Wire.TryDeserialize(data, reader => { var tick = reader.ReadUInt32(); var count = reader.ReadUInt16(); if (count > CoopProtocol.MaxActorsPerSnapshot) throw new InvalidDataException(); var actors = new ActorSnapshot[count]; for (var i = 0; i < actors.Length; i++) actors[i] = ActorSnapshot.Read(reader); return new ActorSnapshotBatch(tick, actors); }, out value);
}

public readonly record struct ObjectiveState(string Id, byte OwnerTeam, float Progress, bool Contested)
{
    public void Write(BinaryWriter writer) { Wire.WriteString(writer, Id); writer.Write(OwnerTeam); writer.Write(Progress); writer.Write(Contested); }
    public static ObjectiveState Read(BinaryReader reader) => new(Wire.ReadString(reader), reader.ReadByte(), reader.ReadSingle(), reader.ReadBoolean());
}

public readonly record struct WorldBootstrap(string MapId, byte PlayerTeam, int LocalPlayerNetworkId, int MatchMode, int TideScore, int EmberScore, IReadOnlyList<ObjectiveState> Objectives, IReadOnlyList<ActorSnapshot> Actors)
{
    public byte[] Serialize()
    {
        var self = this;
        return Wire.Serialize(writer =>
        {
            Wire.WriteString(writer, self.MapId); writer.Write(self.PlayerTeam); writer.Write(self.LocalPlayerNetworkId); writer.Write(self.MatchMode); writer.Write(self.TideScore); writer.Write(self.EmberScore);
            writer.Write((byte)Math.Min(self.Objectives.Count, 32)); for (var i = 0; i < self.Objectives.Count && i < 32; i++) self.Objectives[i].Write(writer);
            writer.Write((ushort)Math.Min(self.Actors.Count, CoopProtocol.MaxActorsPerSnapshot)); for (var i = 0; i < self.Actors.Count && i < CoopProtocol.MaxActorsPerSnapshot; i++) self.Actors[i].Write(writer);
        });
    }
    public static bool TryDeserialize(ReadOnlySpan<byte> data, out WorldBootstrap value) => Wire.TryDeserialize(data, reader =>
    {
        var map = Wire.ReadString(reader); var team = reader.ReadByte(); var local = reader.ReadInt32(); var mode = reader.ReadInt32(); var tide = reader.ReadInt32(); var ember = reader.ReadInt32();
        var objectiveCount = reader.ReadByte(); if (objectiveCount > 32) throw new InvalidDataException(); var objectives = new ObjectiveState[objectiveCount]; for (var i = 0; i < objectives.Length; i++) objectives[i] = ObjectiveState.Read(reader);
        var actorCount = reader.ReadUInt16(); if (actorCount > CoopProtocol.MaxActorsPerSnapshot) throw new InvalidDataException(); var actors = new ActorSnapshot[actorCount]; for (var i = 0; i < actors.Length; i++) actors[i] = ActorSnapshot.Read(reader);
        return new WorldBootstrap(map, team, local, mode, tide, ember, objectives, actors);
    }, out value);
}

public readonly record struct WorldState(uint Sequence, int TideScore, int EmberScore, bool MatchEnded, byte WinningTeam, IReadOnlyList<ObjectiveState> Objectives)
{
    public byte[] Serialize()
    {
        var self = this;
        return Wire.Serialize(writer =>
        {
            writer.Write(self.Sequence); writer.Write(self.TideScore); writer.Write(self.EmberScore); writer.Write(self.MatchEnded); writer.Write(self.WinningTeam);
            writer.Write((byte)Math.Min(self.Objectives.Count, 32));
            for (var i = 0; i < self.Objectives.Count && i < 32; i++) self.Objectives[i].Write(writer);
        });
    }

    public static bool TryDeserialize(ReadOnlySpan<byte> data, out WorldState value) => Wire.TryDeserialize(data, reader =>
    {
        var sequence = reader.ReadUInt32(); var tide = reader.ReadInt32(); var ember = reader.ReadInt32(); var ended = reader.ReadBoolean(); var winner = reader.ReadByte();
        var objectiveCount = reader.ReadByte(); if (objectiveCount > 32) throw new InvalidDataException();
        var objectives = new ObjectiveState[objectiveCount]; for (var i = 0; i < objectives.Length; i++) objectives[i] = ObjectiveState.Read(reader);
        return new WorldState(sequence, tide, ember, ended, winner, objectives);
    }, out value);
}

public readonly record struct GameEvent(EventKind Kind, uint Sequence, int SourceNetworkId, int TargetNetworkId, float Amount, NetVector3 Position, int Value, string Text)
{
    public void Write(BinaryWriter writer) { writer.Write((byte)Kind); writer.Write(Sequence); writer.Write(SourceNetworkId); writer.Write(TargetNetworkId); writer.Write(Amount); Wire.WriteVector(writer, Position); writer.Write(Value); Wire.WriteString(writer, Text); }
    public static GameEvent Read(BinaryReader reader) => new((EventKind)reader.ReadByte(), reader.ReadUInt32(), reader.ReadInt32(), reader.ReadInt32(), reader.ReadSingle(), Wire.ReadVector(reader), reader.ReadInt32(), Wire.ReadString(reader));
}

public readonly record struct GameEventBatch(IReadOnlyList<GameEvent> Events)
{
    public byte[] Serialize() { var self = this; return Wire.Serialize(writer => { writer.Write((ushort)Math.Min(self.Events.Count, CoopProtocol.MaxEventsPerPacket)); for (var i = 0; i < self.Events.Count && i < CoopProtocol.MaxEventsPerPacket; i++) self.Events[i].Write(writer); }); }
    public static bool TryDeserialize(ReadOnlySpan<byte> data, out GameEventBatch value) => Wire.TryDeserialize(data, reader => { var count = reader.ReadUInt16(); if (count > CoopProtocol.MaxEventsPerPacket) throw new InvalidDataException(); var events = new GameEvent[count]; for (var i = 0; i < events.Length; i++) events[i] = GameEvent.Read(reader); return new GameEventBatch(events); }, out value);
}

internal static class Wire
{
    public static byte[] Serialize(Action<BinaryWriter> write)
    {
        using var stream = new MemoryStream(); using var writer = new BinaryWriter(stream, Encoding.UTF8, true); write(writer); writer.Flush(); return stream.ToArray();
    }

    public static bool TryDeserialize<T>(ReadOnlySpan<byte> data, Func<BinaryReader, T> read, out T value)
    {
        value = default!;
        try { using var stream = new MemoryStream(data.ToArray(), false); using var reader = new BinaryReader(stream, Encoding.UTF8, true); value = read(reader); return stream.Position == stream.Length; }
        catch (Exception ex) when (ex is EndOfStreamException or IOException or InvalidDataException or ArgumentException) { return false; }
    }

    public static void WriteString(BinaryWriter writer, string value)
    {
        var bytes = Encoding.UTF8.GetBytes(value ?? string.Empty); if (bytes.Length > 2048) throw new InvalidDataException("String exceeds protocol limit."); writer.Write((ushort)bytes.Length); writer.Write(bytes);
    }
    public static string ReadString(BinaryReader reader) { var length = reader.ReadUInt16(); if (length > 2048) throw new InvalidDataException(); return Encoding.UTF8.GetString(reader.ReadBytes(length)); }
    public static void WriteVector(BinaryWriter writer, NetVector3 value) { writer.Write(value.X); writer.Write(value.Y); writer.Write(value.Z); }
    public static NetVector3 ReadVector(BinaryReader reader) => new(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle());
    public static void WriteQuaternion(BinaryWriter writer, NetQuaternion value) { writer.Write(value.X); writer.Write(value.Y); writer.Write(value.Z); writer.Write(value.W); }
    public static NetQuaternion ReadQuaternion(BinaryReader reader) => new(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle());
}
