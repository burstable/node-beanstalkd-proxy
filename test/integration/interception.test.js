import BeanstalkdProxy from '../../src/index';
import BeanstalkdClient from 'beanstalkd';
import Promise from 'bluebird';
import expect from 'unexpected';
import {assign} from 'lodash';

describe('command interception', function () {
  beforeEach(function () {
    this.proxy = new BeanstalkdProxy(`${process.env.BEANSTALKD_A_PORT_11300_TCP_ADDR}:${process.env.BEANSTALKD_A_PORT_11300_TCP_PORT}`);
    this.client = new BeanstalkdClient();

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

  it('can send reply', function () {
    this.proxy.interceptCommand('use', function ({command, args}, {reply, connection, protocol}) {
      if (connection.__using) {
        return reply(protocol.buildReply('USING', [connection.__using]));
      }

      setTimeout(function () {
        connection.__using = Math.random().toString();
        return reply(protocol.buildReply('USING', [connection.__using]));
      }, 0);
    });

    return this.client.use('myTube').then(firstUsing => {
      expect(firstUsing, 'not to equal', 'myTube');
      expect(firstUsing, 'not to equal', null);
      expect(firstUsing, 'not to equal', undefined);
      return this.client.use('myTube').then(secondUsing => {
        expect(secondUsing, 'to equal', firstUsing);
      });
    });
  });

  it('can skip', function () {
    this.proxy.interceptCommand('use', function (parsed, {skip}) {
      setTimeout(function () {
        skip();
      }, 0);
    });

    return this.client.use('myTube').then(usingA => {
      return this.client.listTubeUsed().then(usingB => {
        expect(usingA, 'to equal', 'myTube');
        expect(usingB, 'to equal', 'myTube');
      });
    });
  });

  it('can skip to other interceptors', function () {
    let using = Math.random().toString()
      , called = false;

    this.proxy.interceptCommand('use', function (parsed, {skip}) {
      setTimeout(function () {
        called = true;
        skip();
      }, 0);
    });

    this.proxy.interceptCommand('use', function ({command, args}, {reply, connection, protocol}) {
      setTimeout(function () {
        return reply(protocol.buildReply('USING', [using]));
      }, 0);
    });

    return expect(this.client.use('myTube'), 'to be fulfilled with', using).then(() => {
      expect(called, 'to equal', true);
    });
  });

  it('can modify command', function () {
    this.proxy.interceptCommand('use', function ({command, args}, {modify, protocol}) {
      setTimeout(function () {
        return modify(assign({}, args, {
          tube: 'bamboozled'
        }));
      }, 0);
    });

    return this.client.use('myTube').then(() => {
      return this.client.listTubeUsed().then(using => {
        expect(using, 'to equal', 'bamboozled');
      });
    });
  });

  it('can chain command modifications', function () {
    this.proxy.interceptCommand('use', function ({command, args}, {modify, protocol}) {
      setTimeout(function () {
        return modify(assign({}, args, {
          tube: 'bamboozled'
        }));
      }, 0);
    });

    this.proxy.interceptCommand('use', function ({command, args}, {modify, protocol}) {
      modify(assign({}, args, {
        tube: args.tube + 'ABC'
      }));
    });

    return this.client.use('myTube').then(() => {
      return this.client.listTubeUsed().then(using => {
        expect(using, 'to equal', 'bamboozledABC');
      });
    });
  });
});
