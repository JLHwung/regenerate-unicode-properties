const test = require('node:test');
const regenerate = require('regenerate');

test('regenerate-unicode-properties', t => {
	t.assert.ok(
		require('../Binary_Property/ASCII.js').characters instanceof regenerate
	);
	t.assert.ok(
		require('../Binary_Property/Emoji.js').characters instanceof regenerate
	);
	t.assert.ok(
		require('../Binary_Property/Emoji.js').characters.toRegExp().test('\u{1F921}') // U+1F921 CLOWN FACE
	);
	t.assert.ok(
		require('../Script/Linear_A.js').characters.contains(0x10600)
	);
	t.assert.ok(
		!require('../General_Category/Uppercase_Letter.js').characters.contains(0x61)
	);
	t.assert.deepStrictEqual(
		require('../Property_of_Strings/RGI_Emoji_Tag_Sequence.js').strings,
		[
			'\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
			'\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
			'\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}',
		]
	);
	t.assert.ok(
		require('../Property_of_Strings/RGI_Emoji.js').strings.includes('#\uFE0F\u20E3')
	);
	const decode = require('../decode.js');
	t.assert.deepStrictEqual(decode.characters('///hBA').data, [0x10FFFF, 0x110000]);
	for (const invalid of [
		() => decode.characters('A!B'), // Not a base64 digit.
		() => decode.characters('g'), // Ends in the middle of a number.
		() => decode.characters('ggggggCA'), // A number of more than 6 digits.
		() => decode.characters('A'), // Ends in the middle of a range.
		() => decode.characters('gggiBA'), // Starts at U+110000.
		() => decode.characters('///hBB'), // Ends at U+110000.
		() => decode.strings('ACC'), // Ends in the middle of a string.
		() => decode.strings('CAB'), // Longer prefix than the previous string.
		() => decode.strings('ABgggkC'), // Code point U+110000.
	]) {
		t.assert.throws(invalid, /Invalid regenerate-unicode-properties data/);
	}
	t.assert.throws(
		() => require('../Invalid_Property/X.js')
	);
	t.assert.throws(
		() => require('../Script_Extensions/Invalid_Property_Value.js')
	);
	t.assert.ok(
		/^\d+\.\d+\.\d+$/.test(require('../unicode-version.js'))
	);
});
