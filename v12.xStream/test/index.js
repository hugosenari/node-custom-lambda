const http = require('https');

exports.handler = async() => new Promise((resolve, reject) => {
    const request = http.request({
        method: 'GET',
        agent: http.globalAgent,
        host: 'gist.githubusercontent.com',
        path: '/hugosenari/0a59c390416ba9719b71949fb890bd44/raw/f1d2050478451567fb8f49f4c7ffe6c273067355/ringedseal.jpg',
    }, resolve);
    request.on('error', reject);
    request.end();
}).then(res => {
    res.headers = { 'Content-Type': 'image/jpeg' };
    return res;
});
