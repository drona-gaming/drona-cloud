const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Server } = require('socket.io');
const https = require('https');
const basicAuth = require('express-basic-auth');

// Define server port here
const applicationPort = process.env.PORT || 3000;

// Define server domain here
const allowedDomain = 'Your_Domain:3000'; // Replace with your actual domain

// Define server path here
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'client_end'));

// Define server upload path here
const uploadDirectory = 'D:/CloudSync';

// Define server ip lookup here
const ifaces = os.networkInterfaces();
const allOSIps = [];

Object.keys(ifaces).forEach(function (ifname) {
    let alias = 0;
    ifaces[ifname].forEach(function (iface) {
        if ('IPv4' !== iface.family || iface.internal !== false) {
            // Skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
            return;
        }
        if (alias >= 1) {
            // This single interface has multiple ipv4 addresses
            allOSIps.push({
                name: ifname + '; ' + alias,
                address: iface.address,
            });
        } else {
            // This interface has only one ipv4 address
            allOSIps.push({
                name: ifname,
                address: iface.address,
            });
        }
        alias++;
    });
});

// Define your Windows user credentials
const users = {
  'Your_User_ID': 'Your_Password',
  // Add more users as needed
};

// Create the upload directory if it doesn't exist
if (!fs.existsSync(uploadDirectory)) {
  try {
    fs.mkdirSync(uploadDirectory);
  } catch (err) {
    console.error('Error creating upload directory:', err);
  }
}

// Middleware
app.use(basicAuth({
  users,
  challenge: true,
  unauthorizedResponse: 'Access Denied!',
}));

app.use('/static', express.static(uploadDirectory));

// Define the allowed file types
const allowedFileTypes = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.svg', 
                          '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.mpeg', '.webm', 
                          '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.aiff', '.midi', 
                          '.rar', '.7z', '.iso', '.pdf', '.psd', '.cr2', '.nef', '.arw'];

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
      cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
      cb(null, file.originalname);
  },
});

const upload = multer({ storage, fileFilter: (req, file, callback) => {
  const fileExtension = path.extname(file.originalname).toLowerCase();
  if (allowedFileTypes.includes(fileExtension)) {
      // Allow file upload
      callback(null, true);
  } else {
      // Reject file upload
      callback(new Error('Invalid file type.'));
    }
  } 
});

// SSL certificate configuration
const pfxFilePath = path.join(__dirname, 'certificate.pfx'); // Assuming certificate.pfx is in the root folder
const pfxPassword = 'Certificate_Password'; // Replace with your actual password

const options = {
  pfx: fs.readFileSync(pfxFilePath),
  passphrase: pfxPassword,
};

// Create HTTPS server
const server = https.createServer(options, app);

// Configure HTTPS server
app.use((req, res, next) => {
  const host = req.headers.host;
  if (host === allowedDomain) {
    return next();
  } else {
    res.status(403).send('Forbidden: Access denied for this domain.');
  }
});

app.get('/', function (req, res) {
    res.render('index', {
        allOSIps: allOSIps,
        applicationPort: applicationPort,
    });
});

// UpLink server here
server.listen(applicationPort, () => {
    console.log(`CloudSync UpLink successful on https://${allowedDomain}`);

    allOSIps.forEach(function (ip) {
        console.log(ip.name + ' - ' + ip.address + ':' + applicationPort);
    });
});

// Socket.IO setup
const io = new Server(server);

io.on('connection', (socket) => {
  // This code will run when a client connects
  const connectTime = new Date();
  console.log(`New Client Connected at ${connectTime}.`);

  // Get client IP address
  const clientIP = socket.handshake.address;

  // Get client browser name and version
  const userAgent = socket.handshake.headers['user-agent'];
  const browserInfo = userAgent.match(/(chrome|firefox|safari|opera|msie|trident(?=\/))\/?\s*(\d+)/i);
  const browserName = browserInfo && browserInfo[1].toString();
  const browserVersion = browserInfo && browserInfo[2];

  // Log client IP address and browser info
  console.log(`Client IP: ${clientIP}, Browser: ${browserName}, Version: ${browserVersion}`);

  socket.on('disconnect', () => {
  // This code will run when a client disconnects
    const disconnectTime = new Date();
    console.log(`Client with IP ${clientIP} disconnected at ${disconnectTime}.`);
    });
});

// File upload method 
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
      return res.status(400).send('No files were uploaded.');
  }

  // Emit a 'fileUploaded' event to the client
  io.emit('fileUploaded', req.file.originalname);
    res.status(200).send('File uploaded successfully.');
});

// Route to get the list of files
app.get('/files', (req, res) => {
  fs.readdir(uploadDirectory, (err, files) => {
    if (err) {
      console.error('Error reading files:', err);
      return res.status(500).send('Error reading files.');
    }
    res.json(files);
    });
});

// Route to delete a file
app.post('/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadDirectory, filename);  
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error('Error deleting file:', err);
      return res.status(500).send('Error deleting file.');
    }
    res.json({ success: true });
    });
});

// Route to delete all files
app.post('/files', (req, res) => {
  fs.readdir(uploadDirectory, (err, files) => {
    if (err) {
      console.error('Error deleting files:', err);
      return res.status(500).send('Error deleting files.');
    }

    // Delete each file
    files.forEach(file => {
      const filePath = path.join(uploadDirectory, file);
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error('Error deleting file:', err);
    }
    });  
    res.json({ success: true });
    });
});
  
// Route to serve uploaded files
app.get('/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadDirectory, filename);  
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error sending file:', err);
      return res.status(404).send('File not found.');
    }
  });
});