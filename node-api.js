const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';


// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files (including index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to get client IP address
const getClientIp = (req) => {
    let ip = req.headers['x-forwarded-for'] || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress ||
             req.connection.socket.remoteAddress;
    
    // If IP is IPv6 loopback, convert to IPv4 localhost
    if (ip === '::1' || ip === '::ffff:127.0.0.1') {
        ip = '127.0.0.1';
    }
    
    // Handle x-forwarded-for which may contain multiple IPs
    if (ip && ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }
    
    // Remove IPv6 prefix if present
    if (ip && ip.includes('::ffff:')) {
        ip = ip.replace('::ffff:', '');
    }
    
    return ip;
};

// ==================== API ENDPOINTS ====================

// GET /api/health - Check if visitor computer is online
app.get('/api/health', (req, res) => {
    // Since the request is coming from the client, if we receive it, the client is online
    // The frontend will interpret this as "computer healthy"
    res.json({
        status: 'healthy',
        message: 'computer healthy',
        timestamp: new Date().toISOString(),
        online: true
    });
});

// GET /api/info - Get browser version from User-Agent
app.get('/api/info', (req, res) => {
    const userAgent = req.headers['user-agent'] || 'Unknown';
    
    // Parse browser information from User-Agent
    let browserName = 'Unknown';
    let browserVersion = 'Unknown';
    let os = 'Unknown';
    
    // Detect Browser
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg') && !userAgent.includes('OPR')) {
        const match = userAgent.match(/Chrome\/(\d+\.\d+)/);
        browserName = 'Chrome';
        browserVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Firefox')) {
        const match = userAgent.match(/Firefox\/(\d+\.\d+)/);
        browserName = 'Firefox';
        browserVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
        const match = userAgent.match(/Version\/(\d+\.\d+)/);
        browserName = 'Safari';
        browserVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('Edg')) {
        const match = userAgent.match(/Edg\/(\d+\.\d+)/);
        browserName = 'Edge';
        browserVersion = match ? match[1] : 'Unknown';
    } else if (userAgent.includes('OPR') || userAgent.includes('Opera')) {
        const match = userAgent.match(/(?:OPR|Opera)\/(\d+\.\d+)/);
        browserName = 'Opera';
        browserVersion = match ? match[1] : 'Unknown';
    }
    
    // Detect OS
    if (userAgent.includes('Windows NT 10.0')) os = 'Windows 10';
    else if (userAgent.includes('Windows NT 6.1')) os = 'Windows 7';
    else if (userAgent.includes('Windows NT 6.2')) os = 'Windows 8';
    else if (userAgent.includes('Windows NT 6.3')) os = 'Windows 8.1';
    else if (userAgent.includes('Mac OS X')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS';
    else if (userAgent.includes('Android')) os = 'Android';
    
    res.json({
        browser: browserName,
        version: browserVersion,
        fullUserAgent: userAgent,
        operatingSystem: os,
        timestamp: new Date().toISOString()
    });
});

// POST /api/echo - Return a simple message
app.post('/api/echo', (req, res) => {
    // Log the received data for debugging (optional)
    console.log('Echo received data:', req.body);
    
    res.json({
        message: 'Someone is trying to echo here...',
        receivedData: req.body,
        timestamp: new Date().toISOString()
    });
});

// Optional: GET endpoint for echo (for testing)
app.get('/api/echo', (req, res) => {
    res.json({
        message: 'Someone is trying to echo here...',
        note: 'Use POST method to send data',
        timestamp: new Date().toISOString()
    });
});

// Feature new: GET A HELLO WORLD
app.get('/api/hi', (req, res) => {
    res.json({
        message: 'The hello function is now working',
        note: 'This is just another GET request',
        timestamp: new Date().toISOString()
    });
});


// ==================== ADDITIONAL ENDPOINTS FOR FRONTEND ====================

// Endpoint for latency testing (HEAD request support)
app.head('/ping', (req, res) => {
    res.status(200).end();
});

// GET endpoint to provide visitor's IP address to frontend
app.get('/api/ip', (req, res) => {
    const clientIp = getClientIp(req);
    res.json({
        localIP: clientIp,
        timestamp: new Date().toISOString()
    });
});

// Optional: Serve index.html with injected IP address
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error loading page');
            return;
        }
        
        // Inject a script to get IP from server (alternative to WebRTC)
        const clientIp = getClientIp(req);
        const injectedScript = `
        <script>
            // Override the getLocalIP function to use server-provided IP
            (function() {
                const originalGetLocalIP = window.getLocalIP;
                window.getLocalIP = function() {
                    const ipElement = document.getElementById('localIP');
                    if (ipElement && ipElement.innerText === 'Detecting...') {
                        fetch('/api/ip')
                            .then(res => res.json())
                            .then(data => {
                                if (data.localIP && ipElement.innerText === 'Detecting...') {
                                    ipElement.innerText = data.localIP;
                                    addLog('Local IP detected via server: ' + data.localIP, 'success');
                                }
                            })
                            .catch(err => {
                                console.error('Failed to get IP from server:', err);
                                if (typeof originalGetLocalIP === 'function') {
                                    originalGetLocalIP();
                                } else if (ipElement && ipElement.innerText === 'Detecting...') {
                                    ipElement.innerText = 'Not available';
                                }
                            });
                    }
                };
            })();
        </script>
        `;
        
        // Insert the script before the closing body tag
        const modifiedData = data.replace('</body>', `${injectedScript}</body>`);
        res.send(modifiedData);
    });
});

// Start the server
app.listen(PORT,HOST, () => {
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log(`Access from network at: http://${getLocalIp()}:${PORT}`);
    console.log(`- GET  /api/health  - Check client health`);
    console.log(`- GET  /api/info    - Get browser version`);
    console.log(`- POST /api/echo    - Echo endpoint`);
    console.log(`- GET  /api/ip      - Get client IP address`);
    console.log(`- HEAD /ping        - Latency testing`);
    console.log(`- GET  /api/hi      - Says hello from a function`);
});

// Helper to get local IP of the server running this API
function getLocalIp() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Export for testing purposes
module.exports = app;
