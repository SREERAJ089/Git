const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.error("Logs from your program will appear here!");

// Uncomment this block to pass the first stage
const command = process.argv[2];

switch (command) {
    case "init":
        createGitDirectory();
        break;
    case "cat-file":
        const hash = process.argv[4];
        readBlobObject(hash)
        break;
    case "hash-object":
        const object = process.argv[4]
        hashObject(object);
        break;
    case "ls-tree":
        lsTree();
        break;
    case "write-tree":
        const directory = process.cwd();
        const hash40 = writeTree(directory);
        console.log(hash40);
        break;
    default:
        throw new Error(`Unknown command ${command}`);
}

function createGitDirectory() {
  fs.mkdirSync(path.join(process.cwd(), ".git"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), ".git", "objects"), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), ".git", "refs"), { recursive: true });

  fs.writeFileSync(path.join(process.cwd(), ".git", "HEAD"), "ref: refs/heads/main\n");
  console.log("Initialized git directory");
}

function readBlobObject(hash){
    const content = fs.readFileSync(path.join(process.cwd(), ".git", "objects", hash.slice(0,2), hash.slice(2)));
    const dataUnzipped = zlib.inflateSync(content);
    const res = dataUnzipped.toString().split('\0')[1];
    process.stdout.write(res);
}

function hashObject(object){
    const writeCommand = process.argv[3];
	if (writeCommand !== "-w") return;
    const content = fs.readFileSync(object);
    const header = `blob ${content.length}\0`;
    const data = header + content;
    const hash = crypto.createHash("sha1").update(data).digest("hex");
    const objectsDirPath = path.join(process.cwd(), ".git", "objects");
	const hashDirPath = path.join(objectsDirPath, hash.slice(0, 2));
	const filePath = path.join(hashDirPath, hash.slice(2));
	fs.mkdirSync(hashDirPath, { recursive: true });
	fs.writeFileSync(filePath, zlib.deflateSync(data));
	process.stdout.write(hash);
}

function lsTree(){
    let hash = '';
    if(process.argv[3] === "--name-only"){
        hash = process.argv[4];
        const filePath = path.join(process.cwd(), ".git", "objects", hash.slice(0,2), hash.slice(2));
        const compressedData = fs.readFileSync(filePath);
        const decompressedData = zlib.inflateSync(compressedData);
        const entries = decompressedData.toString("utf-8").split('\0');
        const data = entries.slice(1);
        const directoryNames = data.filter((line) => line.includes(" "))
        .map((line) => line.split(" ")[1])
        .filter((names) => names.indexOf("/") === -1);
        const response = directoryNames.join('\n');
        console.log(response);
    }else {
        hash = process.argv[3];
        const filePath = path.join(process.cwd(), ".git", "objects", hash.slice(0,2), hash.slice(2));
        const compressedData = fs.readFileSync(filePath);
        const decompressedData = zlib.inflateSync(compressedData);
        const entries = decompressedData.toString("utf-8").split('\0');
        const data = entries.slice(1);
        const directoryNames = data.filter((line) => line.includes(" "));
        console.log(directoryNames);
    }
}

function writeTree(directory){
    const entries = fs.readdirSync(directory);
    const treeEntries = [];
    
    entries.forEach(entry => {
        const fullPath = path.join(directory, entry);
        const stats = fs.statSync(fullPath);
        
        if(stats.isFile()){
            const blobHash = createBlob(fullPath);
            treeEntries.push({type: 'blob', name: entry, hash: blobHash});
        }else if(stats.isDirectory()){
            const subTreeHash = writeTree(fullPath);
            treeEntries.push({type: 'tree', name: entry, hash: subTreeHash});
        }
    })
    const treeHash = createTreeObject(treeEntries);
    return treeHash;
    
}

function createTreeObject(treeEntries){
    const treeData = treeEntries.map(entry => {
        const type = entry.type === "blob"? "100644" : "40000";
        const name = entry.name;
        const hashBinary = Buffer.from(entry.hash, "hex"); // Binary SHA1
        const entryHeader = `${type} ${name}\0`; // File mode, name, and null terminator
        return Buffer.concat([Buffer.from(entryHeader), hashBinary]); 
        // return `${type} ${name}\0${hashBinary}`;
    });

    const data = Buffer.concat(treeData.map(line => Buffer.from(line)));
    const header = `tree ${data.length}\0`;
    const treeBuffer = Buffer.concat([Buffer.from(header), data]);

    const hash = crypto.createHash("sha1").update(treeBuffer).digest("hex");
    writeObject(hash, treeBuffer);
    return hash;
}

// Function to write an object to .git/objects
function writeObject(hash, data) {
    const objectsDir = path.join(process.cwd(), ".git", "objects");
    const objectDir = path.join(objectsDir, hash.slice(0, 2));
    const objectFile = path.join(objectDir, hash.slice(2));

    fs.mkdirSync(objectDir, { recursive: true });
    fs.writeFileSync(objectFile, zlib.deflateSync(data));
}


// Function to create a blob object and write to .git/objects
function createBlob(filePath) {
    const content = fs.readFileSync(filePath);
    const header = `blob ${content.length}\0`;
    const data = Buffer.concat([Buffer.from(header), content]);

    const hash = crypto.createHash("sha1").update(data).digest("hex");
    writeObject(hash, data);
    return hash;
}