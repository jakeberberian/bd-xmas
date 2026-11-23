'use strict';
const { createHandler } = require('../lib/handler');
const db = require('../lib/db');

module.exports = createHandler(db);
