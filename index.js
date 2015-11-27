'use strict';

var fs = require('fs');
var net = require('net');
var url = require('url');
var Promise = require('bluebird');
var Docker = require('dockerode');

function newClient(config, client) {
    console.log(
`client connected
  from ${client.remoteAddress}
  to ${client.localAddress}:${client.localPort}
  tunneling to ${config.remoteHost}:${config.remotePort}`);

  var forward = net.connect({
    host: config.remoteHost,
    port: config.remotePort
  });

  forward.on('connect', function () {
    forward.pipe(client);
    client.pipe(forward);
  });

  forward.on('error', function (e) {
    console.log('remote shut down: %s', e.message);
    client.end();
  });

  forward.on('close', function () {
    console.log('tunnel closed');
  });

  client.on('error', function (e) {
    console.log('client shut down: %s', e.message);
    forward.end();
  });

  client.on('close', function () {
    console.log('client closed');
  });
}

if (!process.env.DOCKER_HOST || !process.env.DOCKER_CERT_PATH) {
    console.log('Docker environment not ready. You must set DOCKER_HOST and DOCKER_CERT_PATH');
    process.exit(1);
}

var parsedUrl = url.parse(process.env.DOCKER_HOST);
var certpath = process.env.DOCKER_CERT_PATH;
const listeners = {}; // ordered by containerId

var docker = Promise.promisifyAll(new Docker({
    host: parsedUrl.hostname,
    port: parsedUrl.port,
    ca: fs.readFileSync(certpath + '/ca.pem'),
    cert: fs.readFileSync(certpath + '/cert.pem'),
    key: fs.readFileSync(certpath + '/key.pem')
}));

function setupListeners(containerId) {
  const container = Promise.promisifyAll(docker.getContainer(containerId));
  container.inspectAsync().then(function (containerInfo) {
    const portBindings = containerInfo.HostConfig.PortBindings
    const ports = Object.keys(portBindings).map(portSpec => portBindings[portSpec].map(p => p.HostPort));
    listeners[containerId] = ports.map(function (port) {
        var config = {
          remoteHost: parsedUrl.hostname,
          remotePort: parseInt(port),
          localPort: parseInt(port),
          name: containerInfo.Name
        };
        var server = net.createServer(newClient.bind(null, config));
        server.listen(config.localPort, function () {
          console.log(`${config.name} is ready for connections on port ${config.localPort}`);
        });
        server.on('error', function (e) {
          switch (e.code) {
          case 'EACCESS':
            console.error('ERROR: No privilege to bind %d. Will not forward ports for %s', config.localPort, config.name);
            break;
          case 'EADDRINUSE':
            console.error('ERROR: address is already in use: localhost:%d. Will not forward ports for %s', config.localPort, config.name);
            break;

          default:
            console.error('ERROR: %s\n%s', e.message, e.stack);
        }
      });
      return server;
    });
  });
}

function teardownListeners(containerId) {
  const container = Promise.promisifyAll(docker.getContainer(containerId));
  container.inspectAsync().then(containerInfo => {
    listeners[containerId].forEach(server => {
      const port = server.address().port;
      server.close(() => console.log(`${containerInfo.Name} stopped listening for connections on ${port}`));
    });
    listeners[containerId] = [];
  });
}

docker.listContainersAsync()
  .then(containers => {
    containers.forEach(container => {
      setupListeners(container.Id);
    });
  }).catch(function (e) {
    console.log(e.stack);
    process.exit(1);
  });

docker.getEventsAsync()
  .then(function (stream) {
    stream.on('data', function (buffer) {
      const ev = JSON.parse(buffer.toString('utf8'));
      const container = Promise.promisifyAll(docker.getContainer(ev.id));
      switch (ev.status) {
        case 'start': setupListeners(ev.id); break;
        case 'die': teardownListeners(ev.id); break;
      }
    });
  });
