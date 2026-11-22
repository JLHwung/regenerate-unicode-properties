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

const decodeNumbers = function(encoded) {
	const numbers = [];
	let number = 0;
	let shift = 0;
	for (let index = 0; index < encoded.length; index++) {
		const digit = DIGITS[encoded.charCodeAt(index)];
		number += (digit & 31) << shift;
		if (digit & 32) {
			shift += 5;
		} else {
			numbers.push(number);
			number = 0;
			shift = 0;
		}
	}
	return numbers;
};

// The data of a Regenerate set is a sorted list of range boundaries
// `[start, endExclusive, start, endExclusive, …]`. Each boundary is stored as
// its distance to the previous boundary minus one.
const characters = function(encoded) {
	const numbers = decodeNumbers(encoded);
	const set = regenerate();
	let boundary = -1;
	for (let index = 0; index < numbers.length; index += 2) {
		const start = boundary + numbers[index] + 1;
		boundary = start + numbers[index + 1] + 1;
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
	const numbers = decodeNumbers(encoded);
	const result = [];
	let previous = [];
	let index = 0;
	while (index < numbers.length) {
		const prefixLength = numbers[index++];
		const suffixLength = numbers[index++];
		const codePoints = previous.slice(0, prefixLength);
		let string = '';
		for (let position = 0; position < prefixLength; position++) {
			string += fromCodePoint(codePoints[position]);
		}
		for (let position = prefixLength; position < prefixLength + suffixLength; position++) {
			const difference = numbers[index++];
			const codePoint =
				(position < previous.length ? previous[position] : 0) +
				(difference & 1 ? -(difference + 1) / 2 : difference / 2);
			codePoints.push(codePoint);
			string += fromCodePoint(codePoint);
		}
		result.push(string);
		previous = codePoints;
	}
	return result;
};

module.exports = {
	characters: characters,
	strings: strings,
};
