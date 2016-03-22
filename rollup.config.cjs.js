import nodeResolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";

export default {
    entry: 'src/main.js',
    format: 'cjs',
    dest: 'dist/example-cjs.js',
    sourceMap: true,
    
    globals: {
        //global object name: import name (npm module name)
    //    "gl-matrix": "glMatrix"
    }
}
