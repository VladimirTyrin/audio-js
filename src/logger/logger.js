var LEVELS = ["debug", "log", "info", "warn", "error", "trace"];
var noop = require('../lib/noop');

// =================================================================

//  Конструктор

// =================================================================

/**
 * @name Audio.Logger
 * @class Настраиваемый логгер для аудиоплеера.
 * @namespace ya.music
 * @param {String} channel Имя канала, за который будет отвечать экземляр логгера.
 * @constructor
 */
var Logger = function(channel) {
    this.channel = channel;
};

// =================================================================

//  Настройки

// =================================================================

/**
 * Список игнорируемых каналов.
 * @field
 * @type String[]
 * @name Audio.Logger.ignores
 */
Logger.ignores = [];

/**
 * Список отображаемых в консоли уровней лога.
 * @name Audio.Logger.logLevels
 * @field
 * @type String[]
 */
Logger.logLevels = [];

// =================================================================

//  Синтаксический сахар

// =================================================================

/**
 * Запись в лог с уровнем **debug**.
 * @function
 * @name Audio.Logger#debug
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.debug = noop;

/**
 * Запись в лог с уровнем **log**.
 * @name Audio.Logger#log
 * @function
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.log = noop;

/**
 * Запись в лог с уровнем **info**.
 * @function
 * @name Audio.Logger#info
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.info = noop;

/**
 * Запись в лог с уровнем **warn**.
 * @function
 * @name Audio.Logger#warn
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.warn = noop;

/**
 * Запись в лог с уровнем **error**.
 * @function
 * @name Audio.Logger#error
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.error = noop;

/**
 * Запись в лог с уровнем **trace**.
 * @function
 * @name Audio.Logger#trace
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.trace = noop;

/**
 * Метод для обработки ссылок передаваемых в лог.
 * @param url
 * @private
 */
Logger.prototype._showUrl = function(url) {
    return Logger.showUrl(url);
};

/**
 * Метод для обработки ссылок передаваемых в лог. Можно переопределять. По умолчанию не делает ничего.
 * @name Audio.Logger#showUrl
 * @param {String} url Ссылка.
 * @returns {String} ссылку.
 */
Logger.showUrl = function(url) {
    return url;
};

LEVELS.forEach(function(level) {
    Logger.prototype[level] = function() {
        var args = [].slice.call(arguments);
        args.unshift(this.channel);
        args.unshift(level);
        Logger.log.apply(Logger, args);
    };
});

// =================================================================

//  Запись данных в лог

// =================================================================

/**
 * Сделать запись в лог.
 * @function
 * @name Audio.Logger#log
 * @param {String} level Уровень лога.
 * @param {String} channel Канал.
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.log = function(level, channel, context) {
    var data = [].slice.call(arguments, 3).map(function(dumpItem) {
        return dumpItem && dumpItem._logger && dumpItem._logger() || dumpItem;
    });

    var logEntry = {
        timestamp: +new Date(),
        level: level,
        channel: channel,
        context: context,
        message: data
    };

    if (Logger.ignores[channel] || Logger.logLevels.indexOf(level) === -1) {
        return;
    }

    Logger._dumpEntry(logEntry);
};

/**
 * Запись в логе.
 * @typedef {Object} Audio.Logger.LogEntry
 * @namespace ya.music
 * @property {Number} timestamp Время в timestamp формате.
 * @property {String} level Уровень лога.
 * @property {String} channel Канал.
 * @property {Object} context Контекст вызова.
 * @property {Array} message Дополнительные аргументы.
 *
 * @private
 */

/**
 * Записать сообщение лога в консоль
 * @param {ya.music.Audio.Logger~LogEntry} logEntry - сообщение лога
 * @private
 */
Logger._dumpEntry = function(logEntry) {
    try {
        var level = logEntry.level;

        var name = logEntry.context && (logEntry.context.taskName || logEntry.context.name);
        var context = logEntry.context && (logEntry.context._logger ? logEntry.context._logger() : "");

        if (typeof console[level] !== "function") {
            console.log.apply(console, [
                level.toUpperCase(),
                Logger._formatTimestamp(logEntry.timestamp),
                "[" + logEntry.channel + (name ? ":" + name : "") + "]",
                context
            ].concat(logEntry.message));
        } else {
            console[level].apply(console, [
                Logger._formatTimestamp(logEntry.timestamp),
                "[" + logEntry.channel + (name ? ":" + name : "") + "]",
                context
            ].concat(logEntry.message));
        }
    } catch(e) {
    }
};

/**
 * Вспомогательная функция форматирования даты для вывода в коносоль
 * @param timestamp
 * @returns {string}
 * @private
 */
Logger._formatTimestamp = function(timestamp) {
    var date = new Date(timestamp);
    var ms = date.getMilliseconds();
    ms = ms > 100 ? ms : ms > 10 ? "0" + ms : "00" + ms;
    return date.toLocaleTimeString() + "." + ms;
};

module.exports = Logger;
