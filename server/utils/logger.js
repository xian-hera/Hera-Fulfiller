const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, context = {}) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      context
    }) + '\n';
  }

  writeLog(filename, message) {
    const logPath = path.join(this.logDir, filename);
    fs.appendFileSync(logPath, message);
  }

  info(message, context) {
    const formatted = this.formatMessage('INFO', message, context);
    console.log(`[INFO] ${message}`, context);
    this.writeLog('app.log', formatted);
  }

  error(message, context) {
    const formatted = this.formatMessage('ERROR', message, context);
    console.error(`[ERROR] ${message}`, context);
    this.writeLog('error.log', formatted);
  }

  webhook(message, context) {
    const formatted = this.formatMessage('WEBHOOK', message, context);
    console.log(`[WEBHOOK] ${message}`, context);
    this.writeLog('webhook.log', formatted);
  }
}

module.exports = new Logger();