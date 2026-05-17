export const fastHash = (text: string) => {
	return [...text].reduce(
		(hash, c) => (Math.imul(31, hash) + c.charCodeAt(0)) | 0,
		0
	);
};
