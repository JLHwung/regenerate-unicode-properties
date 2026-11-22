'use strict';

// Decoder for the compact data format used by the generated files. See
// `build.js` for the encoder.

const regenerate = require('regenerate');

// Numbers are stored as base64 digits, least significant first. Each digit
// holds 5 bits of the number; digits `>= 32` mean that more digits follow.
const ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DIGITS = [];
for (let index = 0; index < ALPHABET.length; index++) {
	DIGITS[ALPHABET.charCodeAt(index)] = index;
}

// Returns a function that returns the next number of `encoded` each time it is
// called, and `-1` once all numbers have been read.
const numberReader = function(encoded) {
	let index = 0;
	return function() {
		if (index >= encoded.length) {
			return -1;
		}
		let number = 0;
		let shift = 0;
		let digit;
		do {
			digit = DIGITS[encoded.charCodeAt(index++)];
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
	while ((distance = read()) >= 0) {
		const start = boundary + distance + 1;
		boundary = start + read() + 1;
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
	while ((prefixLength = read()) >= 0) {
		const length = prefixLength + read();
		let string = previous.slice(0, offsets[prefixLength]);
		for (let position = prefixLength; position < length; position++) {
			const difference = read();
			const codePoint =
				(position < previousLength ? codePoints[position] : 0) +
				(difference & 1 ? -(difference + 1) / 2 : difference / 2);
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
