// ======== Imports ==========//
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import {GoogleGenAI} from "@google/genai";
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
if(!apiKey) {
    console.error("GEMINI_API_KEY is not set in env variables. Please check");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: apiKey });
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
        process.exit(1);
    }
};

createOrCheckForSessionsDirectory();

//Create path for new/existing sessions 
// takes sessionId and adds to dir. path with .json extn. to create correct file path.
function getSessionFilePath(sessionId){
    return path.join(sessionsDirectory, `${sessionId}.json`);
}

//To save session data to a file
async function saveSession(sessionId, sessionData) {
    const filePath = getSessionFilePath(sessionId);
    try{
        await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2), "utf8");
        console.log(`Session ${sessionId} saved.`);
    }
        //re-throw new error to signal failure to calling function
        // ensures promise returned by saveSession rejects, otherwise may appear to have executed successfully because no error passed back.
    catch (error) {
        console.error(`Error saving ${sessionId}:`, error);
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
        console.error(`Error loading session ${sessionId}:`, error.message);
        throw new Error(`Failed to load session ${sessionId}:, ${error.message}`);
    }
};

//To Generate session ID
function generateSessionId(){
    return Math.random().toString(36).substring(2,18);
}

//=====COMMON FUNCTIONs FOR GEMINI API=======//
// System instructions 
const systemInstructions = {
    role: "system", 
    parts: [
        {text:  `You are an advisor for the user on what insurance program to pick`}, 
        {text: `you will start your response with "I'm Tina. I help you to choose the right insurance policy", if this response is already at the start of the conversation you dont need to repeat it`}
    ]
};

// Greeting instructions
const GREETING_SYSTEM_INSTRUCTION = {
    role: "system",
    parts: [
        {text: "You are a friendly AI assistant. Your first response must be a warm greeting message to the user."},
        {text: `you will end each sentence with an exclamation mark`}
    ]
};

// Contact Gemini, update session history, and save    
async function interactWithGemini(sessionId, currentHistory, newUserMessageParts = null, systemInstructionContent) {
    // Load the session from disk to ensure we're working with the latest state
    let session = await loadSession(sessionId);
    if (!session) {
        // This indicates an issue: session should exist if we're interacting with Gemini.
        throw new Error(`Session ${sessionId} not found for Gemini interaction.`);
    }

    // Prepare the conversation array to send to Gemini
    // It starts with the current history from the session
    let conversationForGemini = [...currentHistory];


    // If there's a new user message, add it to the conversation *before* sending to Gemini
    // newUserMessageParts is expected to be an array of { text: "..." } objects for the user's parts
    if (newUserMessageParts && newUserMessageParts.length > 0) {
        conversationForGemini.push({ role: "user", parts: newUserMessageParts });
    }

    try {
        const result = await ai.models.generateContent({
            model:"gemini-1.5-flash",
            contents: conversationForGemini, // Send the full conversation history to the AI
            config: {
                systemInstruction: systemInstructionContent, // Apply the specific system instruction
            }
        });

        // Extract the AI's response text
        const aiResponse = result.text;

        // Update the session object's conversation history
        // conversationForGemini already includes the latest user message (if sent)
        session.conversationHistory = conversationForGemini; // Sync session history with what was sent to AI
        session.conversationHistory.push({
            role: 'model',
            parts: [{ text: aiResponse }] // Add the AI's response
        });

        // Save the updated session data to disk
        await saveSession(sessionId, session);

        // Return both the AI's direct response and the full updated conversation history
        return { aiResponse, updatedConversationHistory: session.conversationHistory };

    } catch (error) {
        console.error(`Error interacting with Gemini for session ${sessionId}:`, error.response ? error.response.data : error.message);
        // Re-throw a more contextual error for the calling function
        throw new Error(`Failed to get AI response for session ${sessionId}: ${error.message}`);
    }
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

            return res.status(201).json({ // 201 Created is appropriate for a new resource
                sessionId: sessionId,
                conversationHistory: sessionData.conversationHistory // This will be an empty array
            });
            // try{
            //     const testToGemini = await ai.models.generateContent({
            //         model: "gemini-2.0-flash", 
            //         contents: [
            //             {role:"user", parts: [{text: "hello"}]}
            //             ],
            //         config: {
            //             systemInstruction: "YOU MUST RESPOND IN ALL CAPITAL LETTERS",
            //         }
            //     });
            
            //     console.log(testToGemini.text);
            // } catch (geminiError){
            //     console.error(`Error: Direct Gemini call for initial greeting failed for ${sessionId}.`)
            // }
        
           
        }
    } catch (error) {
        console.error("Error in /session endpoint", error);
        res.status(500).json({message:"Internal server error in session management, in loading or creating new session."})
        }
});

//Chat Endpoint for Gemini (LLM) AND response to frontend
app.post("/chat", async (req, res) => {
    // Removed jobTitle from destructuring
    const { sessionId, contents } = req.body;

    if (!sessionId) {
        return res.status(400).json({ message: "Session ID is required" });
    }

    try {
        // Load the session first to get its current history
        let session = await loadSession(sessionId);

        // Session not found error
        if (!session) {
            return res.status(404).json({ message: "Session not found on server." });
        }

        // The frontend is expected to send the full conversation, but we only need the last item (new user message)
        const newUserMessageFromFrontend = contents[contents.length - 1];

        // Ensure the new message actually has a role and text
        if (!newUserMessageFromFrontend || !newUserMessageFromFrontend.role || !newUserMessageFromFrontend.parts || !newUserMessageFromFrontend.parts[0]?.text) {
            console.warn("Received malformed user message:", newUserMessageFromFrontend);
            return res.status(400).json({ message: "Invalid user message format." });
        }

        // Extract just the 'parts' array from the new user message (e.g., [{ text: "Hi" }])
        const newUserMessageParts = newUserMessageFromFrontend.parts;

        // Use the interactWithGemini function to get AI response, update history, and save
        const { aiResponse, updatedConversationHistory } = await interactWithGemini(
            sessionId,
            session.conversationHistory, // Pass the history loaded from the session
            newUserMessageParts, // Pass the parts of the new user message
            systemInstructions // Use the specific recruiter instruction for ongoing chat
        );

        // Respond to the frontend with the AI's response and the full updated conversation history
        res.json({ aiResponse, conversationHistory: updatedConversationHistory });

    } catch (error) {
        console.error(`Error in /chat endpoint for session ${sessionId}:`, error.response ? error.response.data : error.message);
        res.status(500).json({ message: "Error processing chat or communicating with AI model", error: error.message });
    }
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