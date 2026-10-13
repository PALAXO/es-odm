import fs from 'fs';
import os from 'os';
import path from 'path';

import bootstrapTest from '../bootstrapTests.js';
import { setLoggerConfig, setLoggerUidFunction } from '../../index.js';
import logger from '../../lib/logger.js';

/**
 * Waits until given file exists - bunyan opens its file streams asynchronously
 * @param filePath {string} Path of the awaited file
 * @returns {Promise<void>}
 */
async function waitForFile(filePath) {
    for (let i = 0; i < 100; i++) {
        if (fs.existsSync(filePath)) {
            return;
        }
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });
    }
}

describe(`logger`, function() {
    this.timeout(testTimeout);

    const TRACE_CONFIG = Object.freeze({
        name: `odmLoggerTest`,
        streams: [{
            level: `trace`,
            type: `console`
        }]
    });

    afterEach(() => {
        //Both the configuration and the UID function are module level globals
        setLoggerUidFunction(function() {});
        setLoggerConfig();
    });

    describe(`setLoggerConfig()`, () => {
        it(`logs all levels through the console stream`, async () => {
            setLoggerConfig(TRACE_CONFIG);

            const records = await bootstrapTest.captureStdout(() => {
                logger.trace({ msg: `traced` });
                logger.debug({ msg: `debugged` });
                logger.info({ msg: `informed` });
                logger.warn({ msg: `warned` });
                logger.error({ msg: `failed` });
                logger.fatal({ msg: `died` });
            });

            expect(records.length).to.equal(6);
            expect(records.map((record) => record.level)).to.deep.equal([10, 20, 30, 40, 50, 60]);
            expect(records.map((record) => record.msg)).to.deep.equal([`traced`, `debugged`, `informed`, `warned`, `failed`, `died`]);
            expect(records[0].name).to.equal(`odmLoggerTest`);
        });

        it(`logs a plain string, an object with 'message' and an object without any message`, async () => {
            setLoggerConfig(TRACE_CONFIG);

            const records = await bootstrapTest.captureStdout(() => {
                logger.info(`plain %s string, 100%% done, %d %o`);   //must not be treated as a format string
                logger.info({ message: `from message` });
                logger.info({ somethingElse: `no message at all` });
            });

            expect(records.length).to.equal(3);
            expect(records[0].msg).to.equal(`plain %s string, 100%% done, %d %o`);
            expect(records[1].msg).to.equal(`from message`);
            expect(records[2].msg).to.equal(``);
            expect(records[2].somethingElse).to.equal(`no message at all`);
        });

        it(`replaces a too long message`, async () => {
            setLoggerConfig(TRACE_CONFIG);

            const shortMessage = `a`.repeat(8000);
            const longMessage = `a`.repeat(9000);

            const records = await bootstrapTest.captureStdout(() => {
                logger.info({ msg: shortMessage });
                logger.info({ msg: longMessage });
            });

            expect(records[0].msg).to.equal(shortMessage);
            expect(records[1].msg).to.equal(`***too long content***`);
        });

        it(`restores the default configuration when called without arguments`, async () => {
            setLoggerConfig(TRACE_CONFIG);
            setLoggerConfig();

            const records = await bootstrapTest.captureStdout(() => {
                //The default configuration logs the console stream from the "warn" level up
                logger.info({ msg: `not logged` });
                logger.warn({ msg: `logged` });
            });

            expect(records.length).to.equal(1);
            expect(records[0].msg).to.equal(`logged`);
            expect(records[0].name).to.equal(bootstrapTest.nconf.get(`logger:name`));
        });

        it(`works with a configuration without streams`, async () => {
            setLoggerConfig({ name: `odmLoggerTest` });

            //Bunyan falls back to its own stdout stream - the ODM console writer is not used
            const records = await bootstrapTest.captureStdout(() => {
                logger.warn({ msg: `default stream` });
            });

            expect(records.length).to.equal(1);
            expect(records[0].msg).to.equal(`default stream`);
        });

        it(`resolves relative and absolute paths of file streams`, async () => {
            const relativePath = path.join(`temp`, `odmLoggerTest.log`);
            const expectedRelative = path.join(import.meta.dirname, `..`, `..`, relativePath);
            const absolutePath = path.join(os.tmpdir(), `odmLoggerTestAbsolute.log`);

            fs.mkdirSync(path.dirname(expectedRelative), { recursive: true });

            try {
                setLoggerConfig({
                    name: `odmLoggerTest`,
                    streams: [{
                        level: `warn`,
                        type: `file`,
                        path: relativePath
                    }, {
                        level: `warn`,
                        type: `rotating-file`,
                        path: absolutePath
                    }]
                });

                logger.warn({ msg: `into both files` });

                await waitForFile(expectedRelative);
                await waitForFile(absolutePath);

                expect(fs.existsSync(expectedRelative)).to.be.true;
                expect(fs.existsSync(absolutePath)).to.be.true;
            } finally {
                //The streams have to be released before the files can be removed
                setLoggerConfig();

                fs.rmSync(expectedRelative, { force: true });
                fs.rmSync(absolutePath, { force: true });
            }
        });
    });

    describe(`setLoggerUidFunction() edge cases`, () => {
        it(`lets the record data win over the UID object`, async () => {
            setLoggerUidFunction(() => {
                return { uid: `fromUid`, action: `fromUid` };
            });

            const records = await bootstrapTest.captureStdout(async () => {
                logger.warn({ action: `fromRecord`, msg: `Checking the precedence.` });
            });

            //The UID object is merged under the record, so the record wins on a shared key
            expect(records[0].action).to.equal(`fromRecord`);
            expect(records[0].uid).to.equal(`fromUid`);
        });

        it(`propagates the error of a UID function which throws`, async () => {
            setLoggerUidFunction(() => {
                throw Error(`The UID function is broken.`);
            });

            //The UID function is called unguarded while the record is written, so its error reaches the logging caller
            await expect(bootstrapTest.captureStdout(async () => {
                logger.warn({ msg: `Checking a broken UID function.` });
            })).to.be.eventually.rejectedWith(`The UID function is broken.`);
        });
    });

    describe(`setLoggerUidFunction()`, () => {
        it(`adds a string UID to the record`, async () => {
            setLoggerConfig(TRACE_CONFIG);
            setLoggerUidFunction(() => `myUid`);

            const records = await bootstrapTest.captureStdout(() => {
                logger.info({ msg: `with uid` });
            });

            expect(records[0].uid).to.equal(`myUid`);
            expect(records[0].msg).to.equal(`with uid`);
        });

        it(`merges an object UID into the record`, async () => {
            setLoggerConfig(TRACE_CONFIG);
            setLoggerUidFunction(() => {
                return { uid: `myUid`, tenant: `test` };
            });

            const records = await bootstrapTest.captureStdout(() => {
                logger.info({ msg: `with uid object` });
            });

            expect(records[0].uid).to.equal(`myUid`);
            expect(records[0].tenant).to.equal(`test`);
            expect(records[0].msg).to.equal(`with uid object`);
        });

        it(`ignores an empty UID`, async () => {
            setLoggerConfig(TRACE_CONFIG);
            setLoggerUidFunction(() => ``);

            const records = await bootstrapTest.captureStdout(() => {
                logger.info({ msg: `without uid` });
            });

            expect(records[0].uid).to.be.undefined;
            expect(records[0].msg).to.equal(`without uid`);
        });
    });
});
