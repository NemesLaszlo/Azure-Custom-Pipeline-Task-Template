import tl = require('azure-pipelines-task-lib/task');
import fetch = require('node-fetch');
import path = require('path');
import fs = require('fs');

let workingDir: string | undefined;
let PAT: string | undefined;
let URL: string | undefined;
let booleanValue: boolean;
let chunkSize: number;

let exampleProduct: any;
let exampleProductVersionObj: any

async function run() {
    try {
        let ch = tl.getInput('chunkSize', true);
        let chunk = Number.parseInt(ch!);
        if (!chunk)
            throw "Chunk size is not specified (or not integer)";
        chunkSize = chunk * 1024 * 1024;
        console.log("Chunk size:" + chunkSize);

        workingDir = tl.getPathInput('cwd', false) || tl.getVariable('agent.workFolder');
        PAT = tl.getInput('PAT', true);
        URL = tl.getInput('URL', true);    
        booleanValue =  tl.getBoolInput('booleanValue', true);

        exampleProduct = await apiRequest("/api/products/" + encodeURIComponent("exampleProductId"), "GET");

        console.log("Found product.");

        exampleProductVersionObj = "For example check the version already exist with a api request or with the `exampleProduct` object"

        if (exampleProductVersionObj){
            console.log("Version: " + exampleProductVersionObj + " already exists");
        } else {
            console.log("Version: " + exampleProductVersionObj + " does not exists");
            console.log("Creating Verison");

            console.log("Uploading files to the version. Using base dir: " + workingDir);

            let filePathValueFullPath = getFullPath(tl.getInput('filePathValue', true) || "");
            let tempIdForTheUploadedFile = await uploadFile(filePathValueFullPath, 1);
            console.log("File uploaded");

            console.log("Creating new version");

            let datePublished = tl.getInput('datePublished', false) || /^(\d{4}-\d{2}-\d{2})T.+$/.exec(new Date().toISOString())![1];
            console.log("Date Published: " + datePublished);
            let changeLog = (tl.getInput('changelog', false) || '').split('\r').join('').split('\n').filter(e => !!e);
            console.log("Change Log: " + changeLog);

            let newVersion = await apiRequest("/api/product/" + encodeURIComponent("exampleProductId") + "/versions/create", "POST", {
                booleanValue: booleanValue,
                UploadedFileTempId: tempIdForTheUploadedFile,
                datePublished: datePublished,
                changelogEntries: changeLog
            });

            console.log("Example version creation was successful. New version: " + newVersion.versionId);
        }
    }
    catch (err: any) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}

async function apiRequest(url: string, method: "GET"|"POST"|"PUT", content? :any, isFile: boolean = false, contentLength?: number, tabIndent: number = 0) : Promise<any> {
    const init: fetch.RequestInit = {
        method: method,
        redirect: "follow"
    }
    
    let u = URL!;
    if (!u.endsWith("/")){
        u += "/";
    }
    u += url.substr(url.startsWith("/")? 1: 0);

    if (content){
        let headers = [
            ['Content-Type', isFile? 'application/octet-stream': 'application/json'],
            ['Authorization', 'Bearer ' + PAT]
        ];

        if (isFile && contentLength){
            headers.push(["Content-Length", contentLength.toString()])
        }

        init.headers = headers;
        init.body = !isFile? JSON.stringify(content): content;
    }
    else{
        init.headers = { 'Authorization': 'Bearer ' + PAT };
    }

    console.log(getLogTabs(tabIndent + 1) + "Sending HTTP " + method + " to " + u)

    return await fetch.default(u, init).catch(err=>{
        console.log(getLogTabs(tabIndent + 1) + "HTTP request failed. Details: " + JSON.stringify(err));
        throw "Failed to fetch. Details: " + JSON.stringify(err);
    }).then(async e=>{
        if (!e.ok){
            let bodyJson = null;
            try{
                if (e)
                  bodyJson = JSON.stringify(await e.json());
            }
            catch (err){
            }
            console.log(getLogTabs(tabIndent + 1) + "HTTP request failed. Code: " + e.status + (bodyJson? ", body: " + bodyJson: ""));
            throw "API throw an error. Code: " + e.status + (bodyJson? ", body: " + bodyJson: "");
        }
        console.log(getLogTabs(tabIndent + 1) + "HTTP request success");
        return e.json();
    })
}

async function uploadFile(filePath: string, tabIndent: number): Promise<any> {
    console.log(getLogTabs(tabIndent + 1) + `Starting file upload of ${path.basename(filePath)} from: ${filePath}.`);

    if (!fs.existsSync(filePath)) {
        console.log(`File ${filePath} doens't exist`);
        throw `File ${filePath} doens't exist`
    }
        
    let fInfo = fs.statSync(filePath);
    if (!fInfo.size) {
        console.log(`File ${filePath} is empty`)
        throw `File ${filePath} is empty`
    }

    console.log(getLogTabs(tabIndent + 1) + "Initiating file upload...");

    let initializeFile = await apiRequest(`/api/file-upload/initialize`, "GET");
    console.log("Init file: " + JSON.stringify(initializeFile));

    let chunkNumber = Math.ceil(fInfo.size / chunkSize);
    console.log(getLogTabs(tabIndent + 1) + `-Uploading data in ${chunkNumber} pieces.`);

    for(let i = 0; i < chunkNumber; ++i) {
        let length = i < chunkNumber - 1 ? chunkSize: (fInfo.size - ((chunkNumber - 1) * chunkSize));

        await apiRequest(`/api/file-upload/${initializeFile.fileId}/append`, "POST",
        fs.createReadStream(filePath, {
            start: i * chunkSize,
            end: (i * chunkSize) + length
        }), true, length, tabIndent + 1);
    }

    console.log(getLogTabs(tabIndent + 1) + `File upload complete for ${filePath}`);
    return initializeFile.fileId;
}

function getLogTabs(tabIndent: number){
    let logPrefix = "";
    for (let i = 0;i< tabIndent + 1;i++) logPrefix += "\t";
    return logPrefix;
}

function getFullPath(p: string) {
    return path.isAbsolute(p)? p: path.join(workingDir!, p);
}

run();

