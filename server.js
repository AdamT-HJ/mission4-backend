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
        {text:  `You are "Tina", an advisor for the user on what insurance product to pick for their vehicle. You communicate with a light informal tone, but you are focused on providing succinct accurate information and helping the user pick the best insurance policy type, Mechanical Breakdown Insurance, Comprehensive Car Insurance, or Third Party Car Insurance.`}, 
        {text: `you will start your response with "I'm Tina. I help you to choose the right insurance policy. May I ask you a few personal questions to make sure I recommend the best policy for you?", if this response is already at the start of the conversation you don't need to repeat it`},
        {text: `You only have three insurance products that you know about and can recommend; Mechanical Breakdown Insurance also called "MBI", Comprehensive Car Insurance, and Third Party Car Insurance. You are to recommend one of these policy types rather than an insurance provider, though you can offer some informal advice on providers ONLY if you have factual true knowledge about them.`},
        {text: `Two rules you MUST follow are; Mechanical Breakdown Insurance "MBI" is not available to trucks and racing cars, AND Comprehensive Car Insurance is only available to any motor vehicles less than 10 years old. You must establish whether these rules are met before making a recommendation to the user, try to avoid directly asking something like "do you own a truck or racing car?".`},
        {text: `After 3 or 4 messages from the user you will try to make a final recommendation based on the information provided and discussion. If it has not been established if user owns a truck or race car you MUST now establish it. You are open to further questions and discussion on final recommendation if the user asks.`},
        {text: `You should have an idea of how much the users vehicle is valued at as part of your evaluation.`},
        {text: `Here is some information on Mechanical Breakdown Insurance (MBI) for you to use; As the name suggests, Mechanical Breakdown Insurance covers the costs of repairing your car that arises from a mechanical breakdown. The policy provides a guarantee for automotive machinery and electronic faults. As car insurance doesn't cover such faults, MBI is designed to protect drivers from unpredictable (and often unaffordable) mechanical repair bills.The idea is that MBI protects you from the risk of having to pay for repairs should your car break down, which could otherwise affect your cash flow and ability to make loan repayments. However, there are a lot of policy exclusions, meaning claiming on MBI can be difficult. For example, if your car has a cambelt issue, exhaust problem or "light bulb" issue (which could include sensor malfunctions), you won't be covered. There are many more exclusions on top of those. MBI isn't cheap - policies can cost around $1,000 to over $4,000, covering the car for 1-4 years. The amount usually added to a car loan, so you'll be charged interest while you make your standard car repayments.`},
        {text: `Here are some comments on Mechanical Breakdown Insurance (MBI) for you to use;"Mechanical Breakdown Insurance (MBI) is often viewed as a mixed bag—both a safeguard and a potential expense. However, MBI does have its value, although it depends heavily on the type of car you own, how you drive it, and your tolerance for financial risk. For some, MBI is an unnecessary expense; for others, it's been a financial lifesaver where the cost of repairs claimed has far exceeded the policy cost. For high-end vehicles, particularly European models like BMWs, Audis, or Volkswagens, MBI can be invaluable. These vehicles are renowned for advanced engineering and luxury features but infamous for high repair costs. A single major fault - a transmission rebuild, an electrical system failure, or issues with cooling systems - can easily cost thousands. In these cases, a robust MBI policy with high claim limits, such as Autosure's Extreme Plus, can pay for itself many times over. It's a tool to offset the financial risks inherent in owning complex and high-performance vehicles, ensuring owners can drive with confidence. For everyday cars, such as Toyotas, Hondas, or Mazdas, MBI is arguably less valuable. These vehicles are designed for reliability and low maintenance costs, so the likelihood of frequent or catastrophic failures is lower. However, even the most reliable vehicles can experience unforeseen issues, especially as mileage increases. A gearbox failure, cooling system breakdown, or suspension issue can still result in repair bills exceeding $1,000 - well within the scope of most insurers' MBI policy coverage. The value of MBI also depends on personal circumstances. For some, the cost of a 1, 2, 3 or 4-year policy (usually paid upfront) is worth it for the peace of mind that comes with knowing that MBI policies will take care of breakdowns (when covered by the policy). For others, committing to regular payments for a product they may never use feels like a waste of money. For this reason, it's essential to assess your vehicle's age, mileage, repair history and intended use when deciding whether MBI is worth it.`},
        {text: `Here is some information on Comprehensive Car Insurance for you to use; Comprehensive car insurance is almost always more expensive than third party car insurance, and is a popular choice for a vehicle worth more than $5,000. However, before deciding whether to select comprehensive or third party, ask yourself - would I have enough money to replace my car if it was in an accident? If you wouldn't, then a Comprehensive policy may be a sensible choice. Comprehensive car insurance specifically covers you if your car is stolen or damaged in an accident. It also pays out to other people if your car damages their vehicle or property. Our guide to the ​Most Stolen Cars has more information about risky models and areas. `},
        {text: `Here is some information on Third Party Car Insurance; Third-Party Car Insurance protects you from liability if you cause an accident and/or damage another person's property. This means you won't be chased for payment by someone who suffers a loss directly caused by your actions. Unlike comprehensive car insurance, your car will not be repaired or replaced if you caused the accident. Third-party car insurance covers damage to other vehicles and property, as well as any legal liability from your actions. It does not cover your vehicle if you are at fault. ​​Know this: Many Third Party Policies provide cover if a third party damages your car and you're not at fault Some insurers, such as Tower and AA Insurance, will pay for repairs to your car if it is damaged in an accident you didn't cause or at not more than 50% at fault. However, you must identify the person at fault (name, phone number and registered number of that other party's vehicle) and prove their vehicle is uninsured. Tower, Trade Me and AA Insurance cover the cost of repairs, the market value of your car, or costs up to $4,000. AMP covers up to $5,000, AMI, State and Protecta cover up to $3,000. 2. The Difference Between Third-Party vs Third Party Fire and Theft Car Insurance. Insurers usually sell two types of third party car insurance - standard and "fire and theft". Fire and theft policies provide additional cover should your vehicle be stolen or damaged / destroyed by fire (unrelated to an accident you cause). Because of the steady number of cars stolen every week, additional coverage beyond standard third party insurance protects you against thieves. ​Policy Costs Our research suggests third party car insurance starts at around $200 a year for drivers over 25 years old who have an accident-free history.`}
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