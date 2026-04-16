# KARI Packet Parser — Serial/UDP Bridge

A Node.js bridge that routes KARI protocol packets between a serial port and UDP sockets. Designed for UGV/UAV communication systems on embedded Linux platforms (e.g., NVIDIA Jetson with `/dev/ttyTHS1`).

## Overview

This application acts as a bidirectional gateway:

- **Serial → UDP**: Reads raw bytes from a serial port, parses KARI-format packets (header `0xAA 0x55`), and routes them to the appropriate destination via UDP unicast or broadcast based on the destination node ID.
- **UDP → Serial**: Receives UDP packets (unicast and broadcast) from other nodes and forwards them to the serial port.

## KARI Packet Format

| Offset | Size    | Field             |
|--------|---------|-------------------|
| 0      | 1 byte  | Header 1 (`0xAA`) |
| 1      | 1 byte  | Header 2 (`0x55`) |
| 2      | 1 byte  | Payload length    |
| 3      | 1 byte  | Packet sequence   |
| 4      | 1 byte  | Source ID         |
| 5      | 1 byte  | Source port       |
| 6      | 1 byte  | Destination ID    |
| 7      | 1 byte  | Destination port  |
| 8      | 1 byte  | Packet priority   |
| 9      | 1 byte  | Message ID        |
| 10+    | N bytes | Payload data      |

Total packet size = `payload_length + 12` bytes.

- **Destination ID `255`** is treated as a broadcast and sent via the broadcast socket.
- All other destination IDs are resolved to IP addresses via a configurable lookup table and sent via unicast.

## Configuration

Edit the constants at the top of `serial-udp-bridge.js`:

```js
const UNICAST_PORT  = 20001;       // UDP unicast listen/send port
const BROADCAST_PORT = 20002;      // UDP broadcast listen/send port
const SERIAL_PATH   = '/dev/ttyTHS1'; // Serial device path
const SERIAL_BAUD_RATE = 115200;   // Serial baud rate
```

Node ID to IP address mapping:

```js
const nodeIdToIpMap = {
  1: '172.30.10.30',
  2: '172.30.10.30',
  // ...
  255: '172.30.10.255',  // broadcast
};
```

## Requirements

- Node.js 16+
- npm packages: `serialport`, `broadcast-address`

## Installation

```bash
npm install serialport broadcast-address
```

## Usage

```bash
node serial-udp-bridge.js
```

The application will:
1. Open the serial port and bind UDP sockets
2. Parse incoming serial data for valid KARI packets
3. Route packets to the correct UDP destination
4. Forward incoming UDP packets to the serial port

## File Structure

```
kari-parser/
├── serial-udp-bridge.js   # Main bridge application (refactored)
├── testSerialK.js          # Original prototype (kept for reference)
└── README.md
```

## License

MIT License
