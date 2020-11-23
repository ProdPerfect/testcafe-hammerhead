import domain from 'domain';
import os from 'os-family';

const connectionResetDomain = domain.create();

connectionResetDomain.on('error', err => {
    // NOTE: The nodejs throw the EPIPE error instead of the ECONNRESET error
    // when the connection is broken in some cases on MacOS and Linux
    // https://github.com/nodejs/node/blob/8b4af64f50c5e41ce0155716f294c24ccdecad03/test/parallel/test-http-destroyed-socket-write2.js
    if (err.code === 'ECONNRESET' || !os.win && err.code === 'EPIPE' || os.win && err.code === 'ECONNABORTED')
        return;

    // There seems to be an error case where OpenSSL tries to read from a connection, and an SSL_ERROR_SYSCALL error (code 5)
    // is returned. However, the error queue is empty (or node's error handling is wrong - I have no idea). However, I'm led
    // to believe it's the result of an I/O error/protocol violation. The client expects to read  more data, but the remote
    // server has closed the connection.
    //
    // I haven't confirmed this yet - or read enough of the OpenSSL docs to confirm that the error handling code is correct,
    // but this will catch and ignore the error - which is actually a TLSSocket object.
    if (err.domainEmitter && err.domainEmitter.constructor && err.domainEmitter.constructor.name === 'TLSSocket') {
        return;
    }

    connectionResetDomain.removeAllListeners('error');
    throw err;
});

export default function (fn: (...args: any[]) => unknown) {
    connectionResetDomain.run(fn);
}
