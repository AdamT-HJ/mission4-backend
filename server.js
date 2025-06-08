// ======== Imports ==========//
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
// import {GoogleGenAi} from "@google/genai";
import fs from "fs/promises";
import path from "path";

//Instantiate Express app and define port
const app = express();
const port = process.env.PORT || 5000;
dotenv.config();

// =======Middleware =========//

app.use(express.json());

const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({
    origin: corsOrigin,
    methods: ["GET", "POST"]
    })
);

//===VARIABLES=======//
const apiKey = process.env.API_KEY;



//====FILE MANAGEMENT FOR "SESSIONS"====//




//=====ENDPOINTS=====//

//------GET ENDPOINT TEST
app.get("/test", (req, res) => {
    res.status(200).json({message: "test successful from node.js!"});
});




// --------- Start Server------//
const server = app.listen(port, () =>{
    console.log(`Server is listening at http://localhost:${port}.`);
});

server.on('error', (error) =>{
    if (error.code === 'EADDRINUSE') {
        console.error(`PORT ${port} is already in use. Please choose a different port or stop other application.`)
    }
    else {
        console.error("Server startup error", error);
    }
    process.exit(1);
});