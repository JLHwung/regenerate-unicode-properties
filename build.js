'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const jsesc = require('jsesc');
const regenerate = require('regenerate');
const UNICODE_VERSION = require('./unicode-version.js');
const { default: unicode } = require(`@unicode/unicode-${ UNICODE_VERSION }`);

/*----------------------------------------------------------------------------*/

const emptyDirSync = function (directory) {
	fs.readdirSync(directory).forEach((file) => {
		const fullPath = `${directory}/${file}`;
		fs.rmSync(fullPath, { recursive: true, force: true });
	});
};

const decode = require('./decode.js');

// Encoder for the compact data format. See `decode.js` for the decoder.
const ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const encodeNumbers = function(numbers) {
	let output = '';
	for (let number of numbers) {
		assert.ok(Number.isSafeInteger(number) && number >= 0);
		while (number >= 32) {
			output += ALPHABET[32 + number % 32];
			number = Math.floor(number / 32);
		}
		output += ALPHABET[number];
	}
	return output;
};

const encodeCharacters = function(set) {
	const numbers = [];
	let boundary = -1;
	for (const next of set.data) {
		numbers.push(next - boundary - 1);
		boundary = next;
	}
	const encoded = encodeNumbers(numbers);
	assert.deepStrictEqual(decode.characters(encoded).data, set.data);
	return encoded;
};

const encodeStrings = function(strings) {
	const numbers = [];
	let previous = [];
	for (const string of strings) {
		const codePoints = Array.from(string, (symbol) => symbol.codePointAt(0));
		let prefixLength = 0;
		while (
			prefixLength < codePoints.length &&
			codePoints[prefixLength] === previous[prefixLength]
		) {
			prefixLength++;
		}
		numbers.push(prefixLength, codePoints.length - prefixLength);
		for (let position = prefixLength; position < codePoints.length; position++) {
			const difference = codePoints[position] -
				(position < previous.length ? previous[position] : 0);
			numbers.push(difference < 0 ? -difference * 2 - 1 : difference * 2);
		}
		previous = codePoints;
	}
	const encoded = encodeNumbers(numbers);
	assert.deepStrictEqual(decode.strings(encoded), strings);
	return encoded;
};

const setToCode = function(set) {
	return `const decode = require('../decode.js');\n` +
		`exports.characters = decode.characters('${ encodeCharacters(set) }');\n`;
};

const INDEX = new Map();

/*----------------------------------------------------------------------------*/

const nonBinaryProperties = [
	'General_Category',
	'Script',
	'Script_Extensions',
];

for (const property of nonBinaryProperties) {
	const values = [];
	// Empty the target directory, or create it if it doesn’t exist yet.
	const directory = `${ property }`;
	console.log(`Emptying ${ directory }…`);
	emptyDirSync(directory);
	console.assert(unicode[property], `Property ${ property } not found.`);
	for (const value of unicode[property]) {
		values.push(value);
		const fileName = `${ directory }/${ value }.js`;
		console.log(`Creating ${ fileName }…`);
		const { default: codePoints } = require(
			`@unicode/unicode-${ UNICODE_VERSION }/${ property }/${ value }/code-points.mjs`
		);
		const set = regenerate(codePoints);
		const output = setToCode(set);
		fs.writeFileSync(fileName, output);
	}
	INDEX.set(property, values.sort());
}

/*----------------------------------------------------------------------------*/

const { default: supportedProperties } = require('unicode-canonical-property-names-ecmascript');
for (const property of nonBinaryProperties) {
	supportedProperties.delete(property);
}
const binaryProperties = [...supportedProperties];

// Empty the target directory, or create it if it doesn’t exist yet.
const directory = 'Binary_Property';
console.log(`Emptying ${ directory }…`);
emptyDirSync(directory);
for (const property of binaryProperties) {
	const fileName = `${ directory }/${ property }.js`;
	console.log(`Creating ${ fileName }…`);
	const { default: codePoints } = require(
		`@unicode/unicode-${ UNICODE_VERSION }/Binary_Property/${ property }/code-points.mjs`
	);
	const set = regenerate(codePoints);
	const output = setToCode(set);
	fs.writeFileSync(fileName, output);
}

const allBinaryProperties = binaryProperties.sort();
INDEX.set('Binary_Property', allBinaryProperties);

/*----------------------------------------------------------------------------*/

const propertiesOfStrings = [
	'Basic_Emoji',
	'Emoji_Keycap_Sequence',
	'RGI_Emoji_Modifier_Sequence',
	'RGI_Emoji_Flag_Sequence',
	'RGI_Emoji_Tag_Sequence',
	'RGI_Emoji_ZWJ_Sequence',
	'RGI_Emoji',
].sort();

// Empty the target directory, or create it if it doesn’t exist yet.
const posDirectory = 'Property_of_Strings';
console.log(`Emptying ${ posDirectory }…`);
emptyDirSync(posDirectory);

for (const property of propertiesOfStrings) {
	const fileName = `${ posDirectory }/${ property }.js`;
	console.log(`Creating ${ fileName }…`);
	const { default: rawStrings } = require(`@unicode/unicode-${ UNICODE_VERSION }/Sequence_Property/${ property }/index.mjs`);
	const codePoints = [];
	const strings = [];
	for (const rawString of rawStrings) {
		if (rawString.length === 1 || (rawString.length === 2 && rawString.codePointAt(0) > 0xFFFF)) {
			codePoints.push(rawString.codePointAt(0));
		} else {
			strings.push(rawString);
		}
	}
	const set = regenerate(codePoints);
	const output = setToCode(set) +
		`exports.strings = decode.strings('${ encodeStrings(strings) }');\n`;
	fs.writeFileSync(fileName, output);
}
INDEX.set('Property_of_Strings', propertiesOfStrings);

/*----------------------------------------------------------------------------*/

const output = `module.exports = ${
	jsesc(INDEX, {
		'compact': false
	})
};\n`;
fs.writeFileSync('index.js', output);

/*----------------------------------------------------------------------------*/

const packageData = require('./package.json');
const dependencies = Object.keys(packageData.devDependencies);
const unicodePackage = dependencies.find((name) =>/^@unicode\/unicode-\d/.test(name));
const unicodeVersion = unicodePackage.replace(/^@unicode\/unicode-/g, '');
const versionOutput = `module.exports = ${
	jsesc(unicodeVersion, {
		'wrap': true
	})
};\n`;
fs.writeFileSync('unicode-version.js', versionOutput);
