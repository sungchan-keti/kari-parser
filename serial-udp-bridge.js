const dgram = require('dgram');
const { SerialPort } = require('serialport');
const os = require('os');
const broadcastAddress = require('broadcast-address');

// Network configuration
const UNICAST_HOST = '127.0.0.1';
const UNICAST_PORT = 20001;
const BROADCAST_HOST = broadcastAddress('eth0');
const BROADCAST_PORT = 20002;

// Serial port configuration
const SERIAL_PATH = '/dev/ttyTHS1';
const SERIAL_BAUD_RATE = 115200;

// KARI packet protocol constants
const HEADER_BYTE_1 = 0xaa;
const HEADER_BYTE_2 = 0x55;
const HEADER_OVERHEAD = 12;
const BROADCAST_DESTINATION_ID = 255;

// Node ID to IP address mapping
const nodeIdToIpMap = {
  1: '172.30.10.30',
  2: '172.30.10.30',
  3: '172.30.10.30',
  4: '172.30.10.30',
  5: '172.30.10.30',
  6: '172.30.10.30',
  7: '172.30.10.255',
  8: '172.30.10.30',
  9: '172.30.10.30',
  10: '172.30.10.30',
  255: '172.30.10.255',
};

// Detect local IP address
const networkInterfaces = os.networkInterfaces();
const localIpAddress = networkInterfaces['eth0'][0].address;
console.log('Local IP address:', localIpAddress);
console.log('Node ID to IP map:', nodeIdToIpMap);

// Initialize sockets and serial port
const unicastSocket = dgram.createSocket('udp4');
const broadcastSocket = dgram.createSocket('udp4');

const serialPort = new SerialPort({
  path: SERIAL_PATH,
  baudRate: SERIAL_BAUD_RATE,
});

// Serial receive buffer
let serialBuffer = Buffer.alloc(0);
let packetCount = 0;

// --- UDP → Serial: forward incoming UDP packets to serial port ---

unicastSocket.on('message', (message, rinfo) => {
  console.log('Unicast received:', rinfo.address, rinfo.port, 'data:', message.toString('hex'));
  if (rinfo.address === localIpAddress) {
    console.log('Ignoring unicast from self');
  } else {
    forwardToSerial(message);
  }
});

broadcastSocket.on('message', (message, rinfo) => {
  console.log('Broadcast received:', rinfo.address, rinfo.port, 'data:', message.toString('hex'));
  if (rinfo.address === localIpAddress) {
    console.log('Ignoring broadcast from self');
  } else {
    forwardToSerial(message);
  }
});

function forwardToSerial(data) {
  serialPort.write(data, (err) => {
    if (err) {
      console.error('Serial write error:', err);
    }
  });
}

// --- Serial → UDP: parse KARI packets and route via UDP ---

serialPort.on('data', (data) => {
  console.log('Serial received:', data.toString('hex'));

  if (data.length === 0) return;

  packetCount += 1;
  serialBuffer = Buffer.concat([serialBuffer, data]);

  parseSerialBuffer();
});

function parseSerialBuffer() {
  for (let i = 0; i < serialBuffer.length; i++) {
    if (i + 2 >= serialBuffer.length) break;

    // Look for packet header: 0xAA 0x55
    if (serialBuffer[i] !== HEADER_BYTE_1 || serialBuffer[i + 1] !== HEADER_BYTE_2) continue;

    const payloadLength = serialBuffer[i + 2];
    const totalPacketLength = payloadLength + HEADER_OVERHEAD;

    // Check if full packet is available in buffer
    if (serialBuffer.length - i < totalPacketLength) break;

    // Discard bytes before the header
    if (i > 0) {
      console.log('Discarding %d bytes before header', i);
      serialBuffer = serialBuffer.slice(i);
      parseSerialBuffer(); // restart parsing from new buffer start
      return;
    }

    // Extract the complete packet
    const packet = serialBuffer.slice(0, totalPacketLength);
    serialBuffer = serialBuffer.slice(totalPacketLength);

    if (packet.length > 0) {
      routePacket(packet);
    }

    // Restart loop since buffer has shifted
    parseSerialBuffer();
    return;
  }
}

function routePacket(packet) {
  const header = {
    header1: packet[0],
    header2: packet[1],
    payloadLength: packet[2],
    packetSequence: packet[3],
    sourceId: packet[4],
    sourcePort: packet[5],
    destinationId: packet[6],
    destinationPort: packet[7],
    packetPriority: packet[8],
    messageId: packet[9],
  };

  console.log(
    'Parsed packet — seq:%d src:%d:%d dst:%d:%d priority:%d msgId:%d len:%d',
    header.packetSequence,
    header.sourceId, header.sourcePort,
    header.destinationId, header.destinationPort,
    header.packetPriority,
    header.messageId,
    header.payloadLength
  );

  const destinationIp = nodeIdToIpMap[header.destinationId];
  if (!destinationIp) {
    console.error('No IP mapping for destination ID:', header.destinationId);
    return;
  }

  if (header.destinationId === BROADCAST_DESTINATION_ID) {
    sendBroadcast(packet, destinationIp);
  } else {
    sendUnicast(packet, destinationIp);
  }
}

function sendUnicast(packet, destinationIp) {
  console.log('Sending unicast to %s:%d', destinationIp, UNICAST_PORT);
  unicastSocket.send(packet, 0, packet.length, UNICAST_PORT, destinationIp, (err) => {
    if (err) {
      console.error('Unicast send error:', err);
    }
  });
}

function sendBroadcast(packet, destinationIp) {
  console.log('Sending broadcast to %s:%d', destinationIp, BROADCAST_PORT);
  broadcastSocket.send(packet, 0, packet.length, BROADCAST_PORT, BROADCAST_HOST, (err) => {
    if (err) {
      console.error('Broadcast send error:', err);
    }
  });
}

// --- Socket and serial port lifecycle ---

unicastSocket.on('listening', () => {
  console.log('Unicast socket listening on %s:%d', UNICAST_HOST, UNICAST_PORT);
});

broadcastSocket.on('listening', () => {
  broadcastSocket.setBroadcast(true);
  console.log('Broadcast socket listening on %s:%d', BROADCAST_HOST, BROADCAST_PORT);
});

serialPort.on('open', () => {
  console.log('Serial port connected on %s @ %d baud', SERIAL_PATH, SERIAL_BAUD_RATE);
});

serialPort.on('error', (err) => {
  console.error('Serial port error:', err);
});

// Bind sockets
unicastSocket.bind(UNICAST_PORT);
broadcastSocket.bind(BROADCAST_PORT);
