# Dragonfield LAN Co-op · Protocol and test harness

These are the C# networking files and independent test harness from my Dragonfield co-op prototype. The harness exercises packet serialization, session discovery, localhost handshakes, version mismatches, and world snapshots using LiteNetLib.

With the .NET 8 SDK, run:

```sh
dotnet run --project tests/ProtocolHarness/ProtocolHarness.csproj -f net8.0 -c Release
```

This extract runs independently of Unity and the original game. It demonstrates the networking layer. The full mod integration and game assets are outside this snapshot, and a full battle on two physical PCs remains unverified.
