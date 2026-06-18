import dotenv from "dotenv";

// Load environment variables FIRST, before any other imports
dotenv.config();

import bodyParser from "body-parser";
import express from "express";
// Import the bot to ensure it's initialized when server starts
import './bot';
// Import location monitoring service
import { locationMonitoringService } from './services/location-monitoring.service';

const app = express();
app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        bot: {
            token: process.env.TELEGRAM_BOT_TOKEN ? 'Set' : 'Not set',
            polling: 'Always Enabled (Main Purpose)'
        },
        firebase: {
            configs: Object.keys(process.env).filter(key => key.includes('FIREBASE')).length
        },
        webApp: process.env.WEB_APP_URL ? 'Set' : 'Not set'
    });
});

// Webhook endpoint for Telegram (if needed)
app.post('/webhook', (req, res) => {
    console.log('📨 Webhook received:', req.body);
    res.status(200).send('OK');
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`🚀 Bot server running on port ${port}`);
    console.log(`🔗 Health check available at: http://localhost:${port}/health`);
    console.log(`🔗 Webhook endpoint available at: http://localhost:${port}/webhook`);
    console.log(`🤖 Environment check - Bot token: ${process.env.TELEGRAM_BOT_TOKEN ? 'Set' : 'Not set'}`);
    console.log(`🔥 Environment check - Firebase configs: ${Object.keys(process.env).filter(key => key.includes('FIREBASE')).length} found`);
    console.log(`🌐 Environment check - Web app URL: ${process.env.WEB_APP_URL ? 'Set' : 'Not set'} -> ${process.env.WEB_APP_URL}`);
    console.log(`📡 Polling status: Always Enabled (Primary Function)`);

    // Start location monitoring service
    locationMonitoringService.startMonitoring();
    console.log(`📍 Location monitoring service: ${locationMonitoringService.isMonitoring() ? 'Started' : 'Failed to start'}`);
});
