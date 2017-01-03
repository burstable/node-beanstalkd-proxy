import BeanstalkdProxy from '../../src/index';
import BeanstalkdClient from 'beanstalkd';
import Promise from 'bluebird';
import expect from 'unexpected';

function extendProtocol(protocol) {
  protocol.reset();

  protocol.addType('key', String);
  protocol.addCommand('auth <key>\r\n');
  protocol.addReply('NOT_AUTHENTICATED\r\n');
  protocol.addReply('BAD_AUTHENTICATION_KEY\r\n');
  protocol.addReply('OK\r\n');
}

describe('usecase: auth', function () {
  beforeEach(function () {
    BeanstalkdClient.addCommand('auth', 'OK');

    this.proxy = new BeanstalkdProxy(`${process.env.BEANSTALKD_A_PORT_11300_TCP_ADDR}:${process.env.BEANSTALKD_A_PORT_11300_TCP_PORT}`);
    this.client = new BeanstalkdClient();

    extendProtocol(this.client.protocol);
    extendProtocol(this.proxy.protocol);

    this.key = Math.random().toString();

    this.proxy.interceptCommand('auth', ({args}, {reply, protocol, connection}) => {
      if (args.key === this.key) {
        connection.authenticated = true;
        return reply(protocol.buildReply('OK'));
      }
      return reply(protocol.buildReply('BAD_AUTHENTICATION_KEY'));
    });

    this.proxy.interceptCommand('*', function (ignore, {skip, reply, protocol, connection}) {
      if (connection.authenticated) return skip();
      return reply(protocol.buildReply('NOT_AUTHENTICATED'));
    });

    return this.proxy.listen(11300).then(() => {
      return this.client.connect();
    });
  });

  afterEach(function () {
    return Promise.join(
      this.proxy.close(),
      this.client.quit()
    );
  });

  it('rejects commands on an unauthorized connection', function () {
    return expect(this.client.use(Math.random()), 'to be rejected with', 'NOT_AUTHENTICATED');
  });

  it('allows commands on an authorized connection', function () {
    return this.client.auth(this.key).then(() => {
      return expect(this.client.use(Math.random()), 'to be fulfilled');
    });
  });
});
