import net from 'net';
import Promise from 'bluebird';
const CRLF = new Buffer([0x0d, 0x0a]);

export default class BeanstalkdProxy {
  constructor(upstreamConfig) {
    this.upstreamConfig = upstreamConfig;
    this.server = new net.Server();

    this.server.on('connection', (connection) => {
      const upstream = net.createConnection({
        port: upstreamConfig.split(':')[1],
        host: upstreamConfig.split(':')[0]
      });

      upstream.on('error', function (err) {
        let message = 'UPSTREAM_ERROR';
        if (err.code === 'ECONNREFUSED') {
          message = 'UPSTREAM_UNAVAILABLE';
        }

        upstream._error = message;
      });

      connection.on('data', function (data) {
        if (upstream._error) {
          connection.write(Buffer.concat([new Buffer(upstream._error), CRLF]));
          connection.end();
          return;
        }

        upstream.write(data);
      });
      connection.on('end', function () {
        upstream.end();
      });

      upstream.pipe(connection);
    });
  }

  listen(port, host) {
    return new Promise((resolve, reject) => {
      this.server.on('error', reject);
      this.server.listen(port, host, resolve);
    });
  }

  close() {
    return new Promise((resolve) => {
      this.server.unref();
      this.server.close(resolve);
    });
  }
}
