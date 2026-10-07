import { bootWidget } from './boot.js';
import { EXTENSION_ID, SCOPES, DEV_FIXTURES } from './config.js';
import { start } from './app.js';

bootWidget({ extensionId: EXTENSION_ID, scopes: SCOPES, fixtures: DEV_FIXTURES, start });
