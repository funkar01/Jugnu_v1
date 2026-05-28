const fs = require('fs');
const readline = require('readline');

const logPath = 'C:\\Users\\SSD\\.gemini\\antigravity\\brain\\78e2c5c9-ee02-445f-900b-f8ca49212bfb\\.system_generated\\logs\\transcript.jsonl';
if (!fs.existsSync(logPath)) {
    console.error('Log file not found:', logPath);
    process.exit(1);
}

const fileStream = fs.createReadStream(logPath);
const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
});

rl.on('line', (line) => {
    if (line.toLowerCase().includes('freeze')) {
        console.log(line);
    }
});
