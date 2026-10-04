const fs = require('fs');
const path = require('path');

const DIRS_TO_SCAN = ['app', 'components', 'hooks', 'modal', 'dashboards', 'UtilServices', 'context', 'backend'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

let endpoints = [];

function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            scanDir(fullPath);
        } else if (EXTENSIONS.includes(path.extname(fullPath))) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            lines.forEach((line, index) => {
                const regex = /(?:api|axios|httpClient|appService\.httpClient)\.(get|post|put|delete|patch)\(\s*[`'"]([^`'"]+)[`'"]/g;
                let match;
                while ((match = regex.exec(line)) !== null) {
                    endpoints.push({
                        file: fullPath,
                        line: index + 1,
                        method: match[1].toUpperCase(),
                        url: match[2],
                        fullLine: line.trim()
                    });
                }
                const fetchRegex = /fetch\(\s*[`'"]([^`'"]+)[`'"]/g;
                while ((match = fetchRegex.exec(line)) !== null) {
                    endpoints.push({
                        file: fullPath,
                        line: index + 1,
                        method: 'FETCH',
                        url: match[1],
                        fullLine: line.trim()
                    });
                }
            });
        }
    }
}

DIRS_TO_SCAN.forEach(dir => scanDir(path.join(__dirname, '..', dir)));

// Deduplicate by method and url
const uniqueEndpoints = {};
endpoints.forEach(e => {
    const key = `${e.method} ${e.url}`;
    if (!uniqueEndpoints[key]) {
        uniqueEndpoints[key] = [];
    }
    uniqueEndpoints[key].push(e);
});

let md = '# List of Backend URL Endpoints\n\n';
md += '| Method | Endpoint | Occurrences | Files |\n';
md += '|---|---|---|---|\n';

Object.keys(uniqueEndpoints).sort().forEach(key => {
    const items = uniqueEndpoints[key];
    const { method, url } = items[0];
    const files = Array.from(new Set(items.map(i => `${path.basename(i.file)}:${i.line}`))).join('<br/>');
    md += `| ${method} | \`${url}\` | ${items.length} | ${files} |\n`;
});

fs.writeFileSync(path.join(__dirname, '..', 'endpoints_list.md'), md);
console.log(`Extracted ${endpoints.length} endpoint calls into endpoints_list.md`);
