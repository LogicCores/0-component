
exports.forLib = function (LIB) {

    const COMPONENT = require("../../../../lib/firewidgets-for-zerosystem/window.component");

    var exports = {};

    exports.spin = function (context) {
    
        var FireWidgetsComponent = function () {
            var self = this;
        }

        FireWidgetsComponent.prototype.liftComponentsForPageFragment = function (page, html) {

            // TODO: Proactively start initializing component implementations
            //       so they are ready to go when HTML gets rendered in container.
            //       This is irrelevant right now as component implementations
            //       are loaded in batch along with app.

            // TODO: Use proper HTML parser.
            var lines = html.split("\n");
            var linesOut = [];
            var m = null;
            var scriptInfo = null;
            var scriptBuffer = null;
            for (var i=0 ; i<lines.length ; i++) {
                if (scriptBuffer) {
                    if (/<\/script>/.test(lines[i])) {
                        if (scriptInfo.location === "window") {
                            context.registerComponentScript(scriptInfo.id, new Function(
                                "context",
                                scriptBuffer.join("\n")
                            ));
                        }
                        scriptInfo = null;
                        scriptBuffer = null;
                        continue;
                    }
                    scriptBuffer.push(lines[i]);
                    continue;
                }
                // TODO: Be much more forgiving.
                m = lines[i].match(/<script data-component-id="([^"]+)" data-component-location="([^"]+)">/);
                if (m) {
                    scriptInfo = {
                        id: m[1],
                        location: m[2]
                    };
                    scriptBuffer = [];
                    continue;
                }
                linesOut.push(lines[i]);
            }
            return LIB.Promise.resolve(linesOut.join("\n"));
        }

        FireWidgetsComponent.prototype.instanciateComponent = function (config) {
            
            var factory = context.getComponentInstanceFactory(config.impl);
            
            if (!factory) {
                throw new Error("No component instance factory found for component implementation alias '" + config.impl + "'. Make sure the component implementation is being loaded.");
            }

            var component = new factory({
                domNode: config.domNode,
                script: context.getComponentScript(config.id)
            });

            return LIB.Promise.resolve(component);
        }

        return new FireWidgetsComponent(context);
    }

    return exports;
}
