import {walk} from "estree-walker";
import acorn from "acorn";
import MagicString from "magic-string";

function glMatrix_hack(){
    return {
        transform: function(code){
            var s = new MagicString(code);
            var ast = acorn.parse(code, {
                sourceType: "module"
            });
            console.log(ast);
            
            walk(ast, {
                enter: function (node, parent){
                    if (node.type == "ImportDeclaration" && node.source.value =="gl-matrix"){
                        var replacement = node.specifiers.map( function(x){
                             return 'import ' + x.local.name + ' from "' + x.imported.name +'";';
                        }).join("\n");
                        s.overwrite(node.start, node.end, replacement);
                    }
                }
            });

            return {
                code: s.toString(),
                map: s.generateMap()
            }
        }
    }
}

export default {
    entry: 'src/core.js',
    format: 'umd',
    dest: 'dist/camfora.js',
    sourceMap: true,
    
    moduleName: "camforasim",
    
    globals: {
        //global object name: import name (npm module name)
    //    "gl-matrix": "glMatrix"
    },
    plugins: [
        glMatrix_hack()
    ]
}
