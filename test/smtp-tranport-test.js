'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

var chai = require('chai');
var expect = chai.expect;
var sinon = require('sinon');
var smtpTransport = require('../src/smtp-transport');
var simplesmtp = require('simplesmtp');
chai.Assertion.includeStack = true;

var PORT_NUMBER = 8397;
var MockBuilder = require('./mocks/mock-builder');

describe('SMTP Transport Tests', function() {
    var server;

    beforeEach(function(done) {
        server = new simplesmtp.createServer({
            ignoreTLS: true,
            disableDNSValidation: true,
            enableAuthentication: true,
            debug: false,
            authMethods: ['PLAIN', 'XOAUTH2']
        });

        server.on('authorizeUser', function(connection, username, pass, callback) {
            callback(null, username === 'testuser' && (pass === 'testpass' || pass === 'testtoken'));
        });

        server.on('validateSender', function(connection, email, callback) {
            callback(!/@valid.sender/.test(email) && new Error('Invalid sender'));
        });

        server.on('validateRecipient', function(connection, email, callback) {
            callback(!/@valid.recipient/.test(email) && new Error('Invalid recipient'));
        });

        server.listen(PORT_NUMBER, done);
    });

    afterEach(function(done) {
        server.end(done);
    });

    it('Should expose version number', function() {
        var client = smtpTransport();
        expect(client.name).to.exist;
        expect(client.version).to.exist;
    });

    it('Should detect wellknown data', function() {
        var client = smtpTransport({
            service: 'google mail'
        });
        expect(client.options.host).to.equal('smtp.gmail.com');
        expect(client.options.port).to.equal(465);
        expect(client.options.secure).to.be.true;
    });

    it('Should fail envelope', function(done) {
        var client = smtpTransport({
            port: PORT_NUMBER
        });

        client.send({
            data: {},
            message: new MockBuilder({
                from: 'test@invalid.sender',
                to: 'test@valid.recipient'
            }, 'test')
        }, function(err) {
            expect(err.code).to.equal('EENVELOPE');
            done();
        });
    });

    it('Should fail auth', function(done) {
        var client = smtpTransport({
            port: PORT_NUMBER,
            auth: {
                user: 'zzz'
            }
        });

        client.send({
            data: {},
            message: new MockBuilder({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, 'message')
        }, function(err) {
            expect(err.code).to.equal('EAUTH');
            done();
        });
    });

    it('Should send mail', function(done) {
        var client = smtpTransport({
            port: PORT_NUMBER
        });
        var chunks = [],
            message = new Array(1024).join('teretere, vana kere\n');

        server.on('data', function(connection, chunk) {
            chunks.push(chunk);
        });

        server.on('dataReady', function(connection, callback) {
            var body = Buffer.concat(chunks);
            expect(body.toString()).to.equal(message.trim().replace(/\n/g, '\r\n'));
            callback(null, true);
        });

        client.send({
            data: {},
            message: new MockBuilder({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, message)
        }, function(err) {
            expect(err).to.not.exist;
            done();
        });
    });

    it('should proxy error events triggered by the message stream', function(done) {
        var client = smtpTransport({
            port: PORT_NUMBER,
            auth: {
                user: 'testuser',
                pass: 'testpass'
            }
        });
        var streamError = new Error('stream read error');
        var messageString = 'test';
        var message = new MockBuilder({
            from: 'test@valid.sender',
            to: ['test@valid.recipient']
        }, messageString, streamError);

        var errorSpy = sinon.spy();
        client.on('error', errorSpy);

        client.send({
            data: {},
            message: message
        }, function(err) {
            expect(err).to.not.exist;
            expect(errorSpy.callCount).to.equal(1);
            done();
        });
    });

    it('Should login and send mail', function(done) {
        var client = smtpTransport({
            port: PORT_NUMBER,
            auth: {
                user: 'testuser',
                pass: 'testpass'
            }
        });
        var chunks = [],
            message = new Array(1024).join('teretere, vana kere\n');

        server.on('data', function(connection, chunk) {
            chunks.push(chunk);
        });

        server.on('dataReady', function(connection, callback) {
            var body = Buffer.concat(chunks);
            expect(body.toString()).to.equal(message.trim().replace(/\n/g, '\r\n'));
            callback(null, true);
        });

        client.send({
            data: {},
            message: new MockBuilder({
                from: 'test@valid.sender',
                to: 'test@valid.recipient'
            }, message)
        }, function(err) {
            expect(err).to.not.exist;
            done();
        });
    });
});