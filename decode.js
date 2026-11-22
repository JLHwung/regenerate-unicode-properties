'use strict';

// Decoder for the compact data format used by the generated files. See
// `build.js` for the encoder.

const regenerate = require('regenerate');

// Numbers are stored as base64 digits, least significant first. Each digit
// holds 5 bits of the number; digits `>= 32` mean that more digits follow.
// Numbers are below 2^30, so that they fit in 32-bit integer math.
const ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DIGITS = [];
for (let index = 0; index < ALPHABET.length; index++) {
	DIGITS[ALPHABET.charCodeAt(index)] = index;
}

const invalid = function() {
	throw new Error('Invalid regenerate-unicode-properties data.');
};

// Returns a function that returns the next number of `encoded` each time it is
// called. Once all numbers have been read, it returns `-1` if `canEnd` is true
// (i.e. at the start of a range or a string), and throws otherwise.
const numberReader = function(encoded) {
	let index = 0;
	return function(canEnd) {
		if (index >= encoded.length) {
			return canEnd ? -1 : invalid();
		}
		let number = 0;
		let shift = 0;
		let digit;
		do {
			// Past the end of `encoded`, this is `DIGITS[NaN]`. Numbers below 2^30
			// have at most 6 digits.
			digit = DIGITS[encoded.charCodeAt(index++)];
			if (digit === undefined || shift > 25) {
				invalid();
			}
			number += (digit & 31) << shift;
			shift += 5;
		} while (digit & 32);
		return number;
	};
};

// The data of a Regenerate set is a sorted list of range boundaries
// `[start, endExclusive, start, endExclusive, …]`. Each boundary is stored as
// its distance to the previous boundary minus one.
const characters = function(encoded) {
	const read = numberReader(encoded);
	const set = regenerate();
	let boundary = -1;
	let distance;
	while ((distance = read(true)) >= 0) {
		const start = boundary + distance + 1;
		boundary = start + read() + 1;
		if (boundary > 0x110000) {
			invalid();
		}
		set.addRange(start, boundary - 1);
	}
	return set;
};

const fromCodePoint = function(codePoint) {
	if (codePoint <= 0xFFFF) {
		return String.fromCharCode(codePoint);
	}
	codePoint -= 0x10000;
	return String.fromCharCode(
		(codePoint >> 10) + 0xD800,
		(codePoint % 0x400) + 0xDC00
	);
};

// Each string is stored as the number of code points it shares with the
// previous string, the number of remaining code points, and the remaining code
// points. Each remaining code point is stored as its difference from the code
// point at the same position in the previous string (or `0`), mapped to a
// non-negative number: `0, -1, 1, -2, 2, …` become `0, 1, 2, 3, 4, …`.
const strings = function(encoded) {
	const read = numberReader(encoded);
	const result = [];
	// The code points of the previous string, and for each position the length
	// in UTF-16 code units of the previous string up to that position, so that
	// the shared prefix can be sliced off the previous string.
	const codePoints = [];
	const offsets = [0];
	let previous = '';
	let previousLength = 0;
	let prefixLength;
	while ((prefixLength = read(true)) >= 0) {
		if (prefixLength > previousLength) {
			invalid();
		}
		const length = prefixLength + read();
		let string = previous.slice(0, offsets[prefixLength]);
		for (let position = prefixLength; position < length; position++) {
			const difference = read();
			const codePoint =
				(position < previousLength ? codePoints[position] : 0) +
				(difference & 1 ? -(difference + 1) / 2 : difference / 2);
			if (codePoint < 0 || codePoint > 0x10FFFF) {
				invalid();
			}
			codePoints[position] = codePoint;
			string += fromCodePoint(codePoint);
			offsets[position + 1] = string.length;
		}
		result.push(string);
		previous = string;
		previousLength = length;
	}
	return result;
};

module.exports = {
	characters: characters,
	strings: strings,
};
