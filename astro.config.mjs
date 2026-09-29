// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

// GitHub Actions sets GITHUB_REPOSITORY to "owner/repo".
// A repository named "<owner>.github.io" is served at the domain root.
// Any other name is a project site at https://<owner>.github.io/<repo>/.
const repository = process.env.GITHUB_REPOSITORY ?? 'sparktype/sparktype';
const [owner, repo] = repository.split('/');
const userSite = repo === `${owner}.github.io`;

// https://astro.build/config
export default defineConfig({
	site: `https://${owner}.github.io`,
	base: userSite ? '/' : `/${repo}`,
	integrations: [mdx(), sitemap()],
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
