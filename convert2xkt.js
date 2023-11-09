#!/usr/bin/env node

const commander = require('commander');
const npmPackage = require('./package.json');
const {convert2xkt, XKT_INFO} = require("./dist/xeokit-convert.cjs.js");

const fs = require('fs');

const WebIFC = require("web-ifc/web-ifc-api-node.js");
const path = require("path");

const program = new commander.Command();

program.version(npmPackage.version, '-v, --version');

program
    .option('-s, --source [file]', 'path to source file')
    .option('-a, --sourcemanifest [file]', 'path to source manifest file (for converting split file output from ifcgltf -s)')
    .option('-f, --format [string]', 'source file format (optional); supported formats are gltf, ifc, laz, las, pcd, ply, stl and cityjson')
    .option('-m, --metamodel [file]', 'path to source metamodel JSON file (optional)')
    .option('-i, --include [types]', 'only convert these types (optional)')
    .option('-x, --exclude [types]', 'never convert these types (optional)')
    .option('-r, --rotatex', 'rotate model 90 degrees about X axis (for las and cityjson)')
    .option('-g, --disablegeoreuse', 'disable geometry reuse (optional)')
    .option('-z, --mintilesize [number]', 'minimum diagonal tile size (optional, default 500)')
    .option('-t, --disabletextures', 'ignore textures (optional)')
    .option('-n, --disablenormals', 'ignore normals (optional)')
    .option('-o, --output [file]', 'path to target .xkt file when -s option given, or JSON manifest for multiple .xkt files when source manifest file given with -a; creates directories on path automatically if not existing')
    .option('-l, --log', 'enable logging (optional)');

program.on('--help', () => {
    console.log(`\n\nXKT version: ${XKT_INFO.xktVersion}`);
});

program.parse(process.argv);

const options = program.opts();

if (options.source === undefined && options.sourcemanifest === undefined) {
    console.error('Error: please specify path to source file or manifest.');
    program.help();
    process.exit(1);
}

if (options.source !== undefined && options.sourcemanifest !== undefined) {
    console.error('Error: can\'t specify path to source file AND manifest - only one of these params allowed.');
    program.help();
    process.exit(1);
}


if (options.output === undefined) {
    console.error('Error: please specify target xkt file path.');
    program.help();
    process.exit(1);
}

function log(msg) {
    if (options.log) {
        console.log(msg);
    }
}

async function main() {

    if (options.sourcemanifest) {

        log(`[convert2xkt] Running convert2xkt v${npmPackage.version}...`);
        log(`[convert2xkt] Converting glTF files in manifest ${options.sourcemanifest}...`);

        let manifestData = fs.readFileSync(options.sourcemanifest);
        let manifest = JSON.parse(manifestData);

        if (!manifest.gltfOutFiles) {
            console.error(`Error: Input manifest invalid - missing field: gltfOutFiles`);
            process.exit(1);
        }

        const numInputFiles = manifest.gltfOutFiles.length;

        if (numInputFiles === 0) {
            console.error(`Error: Input manifest invalid - gltfOutFiles is zero length`);
            process.exit(1);
        }

        if (manifest.metadataOutFiles && numInputFiles !== manifest.metadataOutFiles.length) {
            console.error(`Error: Input manifest invalid - length of gltfOutFiles and metadataOutFiles don't match`);
            process.exit(1);
        }

        const outputDir = getBasePath(options.output).trim();
        if (outputDir !== "" && !fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, {recursive: true});
        }

        function formatDate(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${day}-${month}-${year}- ${hours}-${minutes}-${seconds}`;
        }

        const xktManifest = {
            inputFile: options.sourcemanifest,
            converterApplication: "convert2xkt",
            converterApplicationVersion: `v${npmPackage.version}`,
            conversionDate: formatDate(new Date()),
            outputDir: outputDir,
            xktFiles: []
        };

        let i = 0;

        const convertNextFile = () => {

            const source = manifest.gltfOutFiles[i];
            const metaModelSource = manifest.metadataOutFiles ? manifest.metadataOutFiles[i] : null;
            const outputFileName = getFileNameWithoutExtension(source);

            const outputFileNameXKT = `${outputFileName}.xkt`;

            convert2xkt({
                WebIFC,
                source,
                format: "gltf",
                metaModelSource,
                modelAABB: manifest.aabb,
                output: path.join(outputDir, outputFileNameXKT),
                includeTypes: options.include ? options.include.slice(",") : null,
                excludeTypes: options.exclude ? options.exclude.slice(",") : null,
                rotateX: options.rotatex,
                reuseGeometries: (options.disablegeoreuse !== true),
                minTileSize: options.mintilesize,
                includeTextures: options.textures,
                includeNormals: options.normals,
                log
            }).then(() => {

                i++;

                log(`[convert2xkt] Converted model${i}.xkt (${i} of ${numInputFiles})`);

                xktManifest.xktFiles.push(outputFileNameXKT);

                if (i === numInputFiles) {
                    fs.writeFileSync(options.output, JSON.stringify(xktManifest));
                    log(`[convert2xkt] Done.`);
                    process.exit(0);
                } else {
                    convertNextFile();
                }

            }).catch((err) => {
                console.error(`Error: ${err}`);
                process.exit(1);
            });
        }

        convertNextFile();

    } else {

        if (options.output) {
            const outputDir = getBasePath(options.output).trim();
            if (outputDir !== "" && !fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, {recursive: true});
            }
        }

        log(`[convert2xkt] Running convert2xkt v${npmPackage.version}...`);
        log(`[convert2xkt] Converting single input file ${options.source}...`);

        convert2xkt({
            WebIFC,
            source: options.source,
            format: options.format,
            metaModelSource: options.metamodel,
            output: options.output,
            includeTypes: options.include ? options.include.slice(",") : null,
            excludeTypes: options.exclude ? options.exclude.slice(",") : null,
            rotateX: options.rotatex,
            reuseGeometries: (options.disablegeoreuse !== true),
            minTileSize: options.mintilesize,
            includeTextures: options.textures,
            includeNormals: options.normals,
            log
        }).then(() => {
            log(`[convert2xkt] Done.`);
            process.exit(0);
        }).catch((err) => {
            console.error(`Error: ${err}`);
            process.exit(1);
        });
    }
}

function getBasePath(src) {
    const i = src.lastIndexOf("/");
    return (i !== 0) ? src.substring(0, i + 1) : "";
}

function getFileNameWithoutExtension(filePath) {
    const baseName = path.basename(filePath);
    const fileNameWithoutExtension = path.parse(baseName).name;
    return fileNameWithoutExtension;
}

function collapseAABB3(aabb = new Float64Array(6)) {
    aabb[0] = Number.MAX_SAFE_INTEGER;
    aabb[1] = Number.MAX_SAFE_INTEGER;
    aabb[2] = Number.MAX_SAFE_INTEGER;
    aabb[3] = -Number.MAX_SAFE_INTEGER;
    aabb[4] = -Number.MAX_SAFE_INTEGER;
    aabb[5] = -Number.MAX_SAFE_INTEGER;

    return aabb;
}

function expandAABB3(aabb1, aabb2) {
    if (aabb1[0] > aabb2[0]) {
        aabb1[0] = aabb2[0];
    }
    if (aabb1[1] > aabb2[1]) {
        aabb1[1] = aabb2[1];
    }
    if (aabb1[2] > aabb2[2]) {
        aabb1[2] = aabb2[2];
    }
    if (aabb1[3] < aabb2[3]) {
        aabb1[3] = aabb2[3];
    }
    if (aabb1[4] < aabb2[4]) {
        aabb1[4] = aabb2[4];
    }
    if (aabb1[5] < aabb2[5]) {
        aabb1[5] = aabb2[5];
    }
    return aabb1;
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
