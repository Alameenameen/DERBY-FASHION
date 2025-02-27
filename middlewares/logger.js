const fs = require('fs');
const path = require('path');


const logDirectory = path.join(__dirname, '../logs');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}


const logger = (req, res, next) => {
    const logFile = path.join(logDirectory, 'order_logs.txt');
    const logData = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - Body: ${JSON.stringify(req.body)}\n`;

  
    fs.appendFile(logFile, logData, (err) => {
        if (err) console.error('Error writing log:', err);
    });

    next(); 
};

module.exports = logger;
