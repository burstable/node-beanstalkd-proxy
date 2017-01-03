import net from 'net';
import Promise from 'bluebird';
import BeanstalkdProtocol from 'beanstalkd-protocol';
const CRLF = new Buffer([0x0d, 0x0a]);

export default class BeanstalkdProxy {
  constructor(upstreamConfig) {
    this.upstreamConfig = upstreamConfig;
    this.server = new net.Server();
    let protocol = this.protocol = new BeanstalkdProtocol();

    this.commandInterception = {};

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

      let remainder = new Buffer(0);
      connection.on('data', (data) => {
        if (upstream._error) {
          connection.write(Buffer.concat([new Buffer(upstream._error), CRLF]));
          connection.end();
          return;
        }

        let [remaining, parsed] = protocol.parseCommand(Buffer.concat([remainder, data]));

        if (remaining) {
          remainder = Buffer.concat([
            remainder,
            remaining
          ]);
        }

        if (parsed) {
          let interceptors = this.commandInterception[parsed.command];

          if (!interceptors || !interceptors.length) {
            return upstream.write(data);
          }

          connection.pause();

          iterate(interceptors, parsed, function (interceptor, result, {next, skip, done}) {
            interceptor(result, {
              connection,
              protocol,
              reply: function reply(buffer) {
                done({reply: buffer});
              },
              skip,
              modify: function modify(args) {
                next({
                  command: result.command,
                  args
                });
              }
            });
          }, function (result) {
            if (result.reply) {
              connection.write(result.reply);
            } else if (result.command) {
              upstream.write(protocol.buildCommand(result.command, result.args));
            } else {
              upstream.write(data);
            }
            connection.resume();
          });
        }
      });
      connection.on('end', function () {
        upstream.end();
      });

      upstream.pipe(connection);
    });
  }

  interceptCommand(command, callback) {
    if (command === '*') {
      return Object.keys(this.protocol.commandMap).forEach(command => {
        this.interceptCommand(command, callback);
      });
    }

    this.commandInterception[command] = this.commandInterception[command] || [];
    this.commandInterception[command].push(callback);
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

function iterate(list, result, callback, done) {
  if (!list.length) return done(result);

  list = list.slice();
  let item = list.shift();

  callback(item, result, {
    next: (result) => iterate(list, result, callback, done),
    skip: () => iterate(list, result, callback, done),
    done
  });
}
