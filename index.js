const dgram = require('dgram');
const { Buffer } = require('buffer');
const isMac = require('is-mac'); // validation mac address
const isIp = require('is-ip'); // validation ip address, determine type (v4/v6)


/**
 * Creates a Magic Packet according to the definition of Wake on LAN's magic packet
 * Details here: https://en.wikipedia.org/wiki/Wake-on-LAN#magicPacket
 * Returns a Buffer with defined buf:
 *      6 Bytes of ff (255) (ff ff ff ff ff ff)
 *      16 * 6 Bytes destination mac (macAddress)
 *      total of (1+16)*6 = 102 Bytes
 *
 * @param macAddress ..the destinations mac address
 * @throws Error if macAddress is invalid
 */
exports.getMagicPacket = (mac) => {
  if (!isMac(mac)) { // first check if macAddress is valid
    throw new Error('MAC Address incorrect');
  }
  const macAddress = mac.replace(/([^A-F^a-f^0-9])/g, ''); // remove special characters
  const buf = Buffer.allocUnsafe(102); // actually create the buffer
  buf.write('ffffffffffff', 'hex');
  for (let i = 1; i < 17; i += 1) { buf.write(macAddress, i * 6, 'hex'); }

  return buf;
};


/**
 * Sends some Magic Packets (according to the specified options)
 *
 * @param macAddress ..the destinations mac address
 * @param options
 *         - destination    destination ip address (default = 255.255.255.255)
 *         - repetition     how often the packet should be resent (default = 5)
 *         - wait           between two packets to be sent (default = 100)
 * @param callback on error
 */
exports.send = (macAddress, opt, callback) => {
  const options = opt || {};
  const destination = options.destination || '255.255.255.255';
  let repetition = options.repetition || 5;
  const wait = options.wait || 150;
  let socket;
  let magicPacket;
  let timer;

  function sendPacket() { // function that actually sends the packet, called later
    repetition -= 1; // decrement counter
    socket.send(magicPacket, 0, magicPacket.length, 9, destination, (err) => {
      if (err || repetition <= 0) { // close and clear timer on error or last packet
        socket.close();
        if (timer) { clearInterval(timer); }
        if (callback) { callback(err); }
      }
    });
  }

  try { // try to create a magic packet
    magicPacket = exports.getMagicPacket(macAddress);
  } catch (err) {
    callback(err);
    return;
  }

  if (!isIp(destination)) { // check the destination ip address
    callback(new Error('IP Address invalid'));
    return;
  }

  // initialize udp socket
  socket = dgram.createSocket(isIp.v4(destination) ? 'udp4' : 'udp6');
  socket.on('error', (err) => {
    socket.close();
    callback(err);
  });
  socket.once('listening', () => {
    socket.setBroadcast(true);
  });

  sendPacket(); // send first packet..
  timer = setInterval(sendPacket, wait); // ..and some others
};

