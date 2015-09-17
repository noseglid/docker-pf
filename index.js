'use strict';

var fs = require('fs');
var net = require('net');
var url = require('url');
var Promise = require('bluebird');
var Docker = require('dockerode');

function newClient(config, client) {
    console.log('new client connected to port', config.localPort);
    console.log('connecting to', config.remoteHost + ':' + config.remotePort);
    var forward = net.connect({
        host: config.remoteHost,
        port: config.remotePort
    });

    forward.on('connect', function () {
        console.log('connected to remote, setting up data pipe');
        forward.pipe(client);
        client.pipe(forward);
    });

    forward.on('error', function (e) {
        console.log('remote shut down: %s', e.message);
    });

    client.on('error', function (e) {
        console.log('client shut down: %s', e.message);
    });
}

if (!process.env.DOCKER_HOST || !process.env.DOCKER_CERT_PATH) {
    console.log('Docker environment not ready. You must set DOCKER_HOST and DOCKER_CERT_PATH');
    process.exit(1);
}

var parsedUrl = url.parse(process.env.DOCKER_HOST);
var certpath = process.env.DOCKER_CERT_PATH;

var docker = Promise.promisifyAll(new Docker({
    host: parsedUrl.hostname,
    port: parsedUrl.port,
    ca: fs.readFileSync(certpath + '/ca.pem'),
    cert: fs.readFileSync(certpath + '/cert.pem'),
    key: fs.readFileSync(certpath + '/key.pem')
}));

docker.listContainersAsync().then(function (containers) {
    containers.forEach(function (container) {
        container.Ports.forEach(function (port) {
            var config = {
                remoteHost: parsedUrl.hostname,
                remotePort: port.PublicPort,
                localPort: port.PublicPort
            };
            var server = net.createServer(newClient.bind(null, config));
            server.listen(config.localPort, function () {
                console.log('ready for connections on port', config.localPort);
            });
        });
    });
}).catch(function (e) {
    console.log(e.stack);
    process.exit(1);
});
