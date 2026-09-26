import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
	{ ignores: [".next/**", "out/**", "ios/**", "android/**", "public/engine/**"] },
	...nextVitals,
	...nextTypescript,
];

export default eslintConfig;