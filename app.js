import axios from 'axios';
import fs from 'fs';
import path from 'path';
import process from 'process';
import inquirer from 'inquirer';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
const tinyUrlToken = '5rjzM1rTOMcQmYdHxQXdjTxgM92oxYSsIw1j19yoFwHt6HrBENFYFiZOSE3s'
const SCOPES = ['https://www.googleapis.com/auth/drive'];
const TOKEN_PATH = path.join(process.cwd(), 'config/token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'config/credentials.json');

const file = {
    id: '',
    path: '',
    name: '',
    type: ''
}


async function loadSavedCredentialsIfExist() {
    try {
        const content = await fs.promises.readFile(TOKEN_PATH);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }
}

async function saveCredentials(client) {
    try {
        const content = await fs.promises.readFile(CREDENTIALS_PATH);
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        const payload = JSON.stringify({
            type: 'authorized_user',
            client_id: key.client_id,
            client_secret: key.client_secret,
            refresh_token: client.credentials.refresh_token,
        });
        await fs.promises.writeFile(TOKEN_PATH, payload);
        console.log('Credentials saved successfully.');
    } catch (error) {
        console.error('Error saving credentials:', error);
    }
}

async function authorize() {
    let client = await loadSavedCredentialsIfExist();
    if (client) {
        return client;
    }

    try {
        client = await authenticate({
            scopes: SCOPES,
            keyfilePath: CREDENTIALS_PATH,
        });
        if (client.credentials) {
            await saveCredentials(client);
        }
        return client;
    } catch (error) {
        console.error('Error authorizing:', error);
        return null;
    }
}

async function uploadFile(authClient, file) {

    const { path, type, name } = file;
    try {
        const drive = google.drive({ version: 'v3', auth: authClient });
        const fileMetadata = {
            name: name,
        };

        const media = {
            mimeType: `image/${type}`,
            body: fs.createReadStream(path),
        };

        const response = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id',
        });
        file.id = response.data.id;
        console.log('File uploaded successfully. File ID:', response.data.id);
    } catch (error) {
        console.error('Error uploading file:', error.message);
    }
}

inquirer.prompt([{
    type: 'input',
    name: 'file',
    message: 'Drop and drag your image in terminal and press enter to upload your file:',
}]).then((answer) => {
    if (answer.file) {
        const arrayFromAnswer = answer.file.split('\\');
        const name = `${arrayFromAnswer[arrayFromAnswer.length - 1].split('.')[0]}`;
        const type = `${arrayFromAnswer[arrayFromAnswer.length - 1].split('.')[1]}`;
        file.path = answer.file;
        file.type = type;
        file.name = name;
    }
}).then(() => {
    return new Promise((resolve, reject) => {
        renameFile().then(() => resolve()).catch(err => reject(err));
    });
}).then(async () => {
    const authClient = await authorize();
    if (authClient) {
        await uploadFile(authClient, file)
    }
}).then(() => {
    inquirer.prompt([{
        type: 'confirm',
        name: 'getViewLink',
        message: `Would you like to shorten your link?`,
    }]).then(async (answer) => {
        const authClient = await authorize();
        if (authClient) {
            const link = await getFileViewUrl(authClient, file.id)
            if (answer.getViewLink) {
                const link = await getFileViewUrl(authClient, file.id);
                const requestBody = {
                    "url": link,
                    "domain": "tinyurl.com",
                    "description": "string"
                }
                const tinyLink = await axios.post('https://api.tinyurl.com/create', requestBody, {
                    headers: {
                        'Authorization': `Bearer ${tinyUrlToken}`
                    }
                }).then(response => {
                    if (response.data && response.data.data.tiny_url) {
                        return response.data.data.tiny_url;
                    } else {
                        console.error('Error creating tiny URL: Response format is incorrect');
                        return null;
                    }
                }).catch(err => console.log(err.code))
                console.log('tiny', tinyLink);
            } else {
                console.log(link);
            }
        }
    })
}).catch(err => console.log(err.code));

async function renameFile() {
    const { rename } = await inquirer.prompt([{
        type: 'confirm',
        name: 'rename',
        message: `You're uploading file with the name ${file.name}.${file.type}\n Would you like to rename it?`,
    }]);
    
    if (rename) {
        const { newName } = await inquirer.prompt([{
            type: 'input',
            name: 'newName',
            message: `Enter new file name (WITHOUT extension .jpg, .png, etc):`,
        }]);
        
        file.name = newName;
    }
}

async function getFileViewUrl(authClient, fileId) {
    try {
        const drive = google.drive({ version: 'v3', auth: authClient });
        const response = await drive.files.get({
            fileId: fileId,
            fields: 'webViewLink',
        });
        const webViewLink = response.data.webViewLink;
        return webViewLink;
    } catch (error) {
        console.error('Error getting webViewLink:', error.message);
    }

}


