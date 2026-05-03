# Forest Monitoring System

## Project Overview

The Forest Monitoring System is a comprehensive real-time environmental monitoring solution designed to track and visualize forest ecosystem data. This application collects sensor data from IoT devices deployed in forest environments and presents the information through an interactive web-based dashboard.

### Purpose

This system enables environmental scientists, forest managers, and researchers to:
- Monitor environmental conditions in real-time (temperature, humidity, air quality, etc.)
- Track changes over time through historical data visualization
- Receive alerts for critical environmental conditions
- Make data-driven decisions for forest management and conservation
- Access monitoring data remotely from anywhere

## What We're Building

A full-stack Node.js application that:
1. **Collects** sensor data via serial communication from IoT devices
2. **Processes** and stores environmental data
3. **Displays** real-time analytics through an interactive dashboard
4. **Provides** historical trends and reporting capabilities

## Project Structure

```
Forest_Monitoring/
├── public/                    # Frontend - Client-side web application
│   ├── index.html            # Landing/home page
│   ├── styles.css            # Global styles
│   ├── dashboard.html        # Main monitoring dashboard UI
│   ├── dashboard.js          # Dashboard interactivity & data handling
│   ├── dashboard.css         # Dashboard-specific styling
│   └── ...                   # Additional frontend assets
├── images/                    # Static images and assets
├── server.js                 # Main Express.js server
│   │                         # - Routes and API endpoints
│   │                         # - Database connections
│   │                         # - Real-time WebSocket communication
│   └──                       # - CORS and middleware setup
├── serial_test.js            # Utility for testing serial port connections
│   │                         # - Debug serial communication
│   │                         # - Validate sensor data format
│   └──                       # - Connection troubleshooting
├── package.json              # Project dependencies & scripts
├── package-lock.json         # Locked dependency versions
├── .env                      # Environment variables (not in git)
├── .gitignore               # Git ignore configuration
└── README.md                # This documentation
```

## Key Features

- **Real-Time Monitoring**: Live sensor data updates via WebSocket connections
- **Interactive Dashboard**: Responsive web interface for data visualization
- **Data Visualization**: Charts and graphs for environmental metrics
- **Serial Communication**: Direct integration with IoT sensors via serial ports
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Historical Data**: Track trends and patterns over time
- **Error Handling**: Graceful error management and user notifications

## Tech Stack

- **Backend**: Node.js with Express.js
- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Communication**: Serial Port (for sensors), WebSockets (real-time updates)
- **Server**: Express.js web framework
- **Deployment**: Node.js runtime environment

## Prerequisites

- Node.js v14.0.0 or higher
- npm v6.0.0 or higher
- Serial port drivers (for Windows/Linux)
- Modern web browser (Chrome, Firefox, Safari, Edge)
- USB ports for sensor device connections

## Installation & Setup

### Step 1: Clone the Repository
```bash
git clone https://github.com/your-username/forest-monitoring.git
cd forest-monitoring/Forest_Monitoring
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment
Create a `.env` file in the root directory:
```env
PORT=3000
NODE_ENV=development
# Add other configuration as needed
```

### Step 4: Verify Serial Connection (Optional)
```bash
node serial_test.js
```

## Running the Application

### Start the Development Server
```bash
npm start
```

The application will be running at:
- **Web Interface**: http://localhost:3000
- **Dashboard**: http://localhost:3000/dashboard

### Hot Module Reloading
The application supports live reloading during development.

## How It Works

1. **Data Collection**: IoT sensors send data via serial port to `serial_test.js`
2. **Server Processing**: `server.js` receives and processes the sensor data
3. **Data Storage**: Environmental metrics are stored/cached on the server
4. **WebSocket Push**: Real-time updates sent to connected dashboard clients
5. **Frontend Display**: `dashboard.js` receives updates and refreshes visualizations

## Development Guide

### Frontend Development
**Location**: `/public` directory

- **dashboard.html**: Structure and layout of the monitoring dashboard
- **dashboard.js**: Logic for data visualization, user interactions, and WebSocket client
- **dashboard.css**: Styling specific to dashboard components
- **styles.css**: Global application styles

**Key Responsibilities**:
- Render sensor data in charts/gauges
- Handle user interactions and filters
- Connect to backend via WebSocket
- Display real-time updates

### Backend Development
**Location**: `server.js`

**Key Responsibilities**:
- Expose REST API endpoints
- Manage serial port communication
- Broadcast WebSocket messages to clients
- Handle data persistence
- Manage server routing and middleware

## Testing

### Test Serial Connection
```bash
node serial_test.js
```

This utility helps:
- Verify serial port availability
- Test sensor data reception
- Debug communication issues
- Validate data format

## Available Scripts

```bash
# Start the server
npm start

# Test serial connections
node serial_test.js
```

## Configuration

### Port Configuration
Edit `server.js` or set `PORT` in `.env` to change the server port.

### Serial Port Configuration
Modify `serial_test.js` to match your sensor's:
- COM port number (Windows) or /dev/ttyUSB* (Linux/Mac)
- Baud rate (typically 9600, 115200, etc.)
- Data format and protocol

## API Endpoints

(To be documented based on your server.js implementation)

## Troubleshooting

### npm start fails
- Ensure you're in the `Forest_Monitoring` directory
- Run `npm install` to reinstall dependencies
- Check that Node.js is properly installed: `node --version`

### Serial Port Issues
- Run `node serial_test.js` to diagnose
- Verify device is connected and recognized by OS
- Check COM port permissions (Windows may need admin)
- Ensure correct baud rate is configured

### Dashboard not loading
- Check server is running on correct port
- Verify frontend files exist in `/public`
- Check browser console for JavaScript errors

## License

MIT License - See LICENSE file for details

## Team

- **Project Lead**: [Your Name]
- **Developer**: [Your Name]
- **Contributor**: [Names]

## Support & Contact

- **Issues**: Create an issue on GitHub
- **Email**: your-email@example.com
- **Documentation**: See Wiki for detailed guides

## Version History

- **v1.0.0** (Current) - Initial release with basic monitoring and dashboard
- Future versions planned with enhanced analytics and reporting

## Learning Resources

- [Node.js Documentation](https://nodejs.org/docs/)
- [Express.js Guide](https://expressjs.com/)
- [WebSocket Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Serial Communication](https://en.wikipedia.org/wiki/Serial_communication)

---

**Last Updated**: May 3, 2026
**Status**: Active Development
