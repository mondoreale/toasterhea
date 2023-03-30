import dts from 'rollup-plugin-dts'
import esbuild from 'rollup-plugin-esbuild'
import babel from '@rollup/plugin-babel'

function bundle(config) {
    return {
        ...config,
        external: [/react/, /eventemitter3/, /lodash/],
    }
}

export default [
    bundle({
        input: './src/index.tsx',
        plugins: [
            esbuild(),
            babel({
                babelHelpers: 'bundled',
                extensions: ['.ts', '.tsx'],
            }),
        ],
        output: [
            {
                file: `./index.js`,
                format: 'es',
            },
            {
                file: './index.cjs',
                format: 'cjs'
            }
        ],
    }),
    bundle({
        input: './src/index.tsx',
        plugins: [dts()],
        output: [
            {
                file: `./index.d.ts`,
                format: 'es',
            },
        ],
    }),
]
