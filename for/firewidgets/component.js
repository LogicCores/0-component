
exports.forLib = function (LIB) {

    var exports = {};

    exports.spin = function (context) {

        var Component = function (componentContext) {
            var self = this;

        }
        Component.prototype = Object.create(LIB.EventEmitter.prototype);
        Component.prototype.contexts = context.contexts;



        var cache = {};

        return {
            Component: Component,
            getForKey: function (componentKey, componentContext) {
                if (!cache[componentKey]) {
console.info("Init new component for key '" + componentKey + "':", componentContext);
                    cache[componentKey] = new Component(componentContext);
                } else {
console.log("Use existing component for key:", componentKey);
                    // NOTE: We assume the 'componentConfig' has NOT changed!
                    // TODO: Update ComponentContext if 'componentConfig' has changed or create new ComponentContext?
                }
                return cache[componentKey];
            }
        };
    }

    return exports;
}
