// ======== Imports ==========//
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
// import {GoogleGenAi} from "@google/genai";
import fs from "fs/promises";
import path from "path";
import { get } from "https";

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

const sessionsDirectory = process.env.SESSIONS_DIR || "./sessions";



//====FILE MANAGEMENT FOR "SESSIONS"====//
// create directory or do nothing if already exists 
async function createOrCheckForSessionsDirectory(){
    try{
        await fs.mkdir(sessionsDirectory, {recursive: true});
        console.log(`Sessions Directory created or existing at:${sessionsDirectory}`);
    }
    catch (error) {
        console.error(`error in creating or confirming sessions directory exists:${error.message}`);
    }
};

//Create path for new/existing sessions 
// takes sessionId and adds to dir. path with .json extn. to create correct file path.
function getSessionFilePath(sessionId){
    return path.join(sessionsDirectory, `${sessionId}.json`);
}

//To save session data to a file
async function saveSession(sessionId, sessionData) {
    const filePath = getSessionFilePath(sessionId);
    try{
        await fetch.writeFile(filePath, JSON.stringify(sessionData, null, 2), "utf8");
        console.log(`Session ${sessionId} saved.`);
    }
        //re-throw new error to signal failure to calling function
        // ensures promise returned by saveSession rejects, otherwise may appear to have executed successfully because no error passed back.
    catch (error) {
        console.error(`Error saving ${sessionid}:`, error);
        throw new Error (`Failed to save session ${sessionId}: ${error.message}`);
    }
};

// To load session data from a file
// uses getSessionFilePath, 
async function loadSession(sessionId) {
    const filePath = getSessionFilePath(sessionId);
    try{
        const data = await fs.readFile(filePath, "utf8");
        return JSON.parse(data);
    }
    catch (error) {
        //ENOENT - Error no Entry
        if (error.code === "ENOENT"){
            return null;
        }
        console.error(`Error loading session ${sessionId}:`, error);
        throw new Error(`Failed to load session ${sessionId}`);
    }
};

//To Generate session ID
function generateSessionId(){
    return Math.random().toString(36).substring(2,18);
}




//=====ENDPOINTS=====//

//------GET ENDPOINT TEST
app.get("/test", (req, res) => {
    res.status(200).json({message: "test successful from node.js!"});
});


//Session Management Endpoint 
app.get("/session", async (req, res)=>{
    const requestedSessionId = req.query.sessionId;

    try{
        let sessionId;
        let sessionData;

        //trying to load existing session on request
        if(requestedSessionId) {
            const loadedSession = await loadSession(requestedSessionId);
            if(loadedSession){
                sessionId = requestedSessionId;
                sessionData = loadedSession;
                return res.json({
                    sessionId,
                    conversationHistory: sessionData.conversationHistory
                });
            }
            else {
                return res.status(400).json({message: "session ID not found"});
            }
        }
        else {
            //create new session if no requested sessionId
            sessionId = generateSessionId();
            sessionData = {
                conversationHistory:[]
            };
            //save session
            await saveSession(sessionId, sessionData);
            return res.status(200).json({sessionId, conversationHistory:[]})
        
            //insert code to do initial call to Gemini to get greeting to user.
            
        }
    }
    catch (error) {
        console.error("Error in /session endpoint", error);
        res.status(500).json({message:"Internal server error in session management, in loading or creating new session."})
    }
});

//Chat Endpoint for Gemini (LLM) AND response to frontend




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