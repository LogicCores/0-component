
exports.forLib = function (LIB) {

    var exports = {};

    exports.spin = function (context) {

        var ComponentContext = function (componentConfig) {
            var self = this;
            
            self.id = componentConfig.id;
            self.descriptor = {};


            // Locally persisted component state
            var state = {};
            var localStorage = context.contexts.adapters.cache.localStorage;
            // TODO: Derive this more elegantly from context.
            var localStorageNamespace = context.contexts.page.getBasePath() + "~" + context.contexts.page.getPath() + "~" + componentConfig.id;
            var state = {};
            try {
                state = JSON.parse(localStorage.get(localStorageNamespace) || "{}");
            } catch (err) {
                // TODO: Deal with error.
            }
            self.get = function (name) {
                // TODO: Merge with config options before returning value at name/pointer
                return state[name];
            };
            self.set = function (name, value, options) {
                options = options || {};
                if (value === state[name]) return;
                var valueBefore = state[name];
                state[name] = value;
                // TODO: Warn if value is too large or use alternative method to persist state.
                localStorage.set(localStorageNamespace, JSON.stringify(state));
                if (options.notifyChange !== false) {
                    // NOTE: This is needed to prevent rendering bugs in Semantic UI (e.g. dropdown)
                    setTimeout(function () {
                        self.emit("changed", {
                            reason: "state",
                            component: self.id,
                            before: valueBefore,
                            after: state[name]
                        });
                    }, 0);
                }
            };
            
            // Enable this component to interact with other components on the page.
            self.getPageComponent = function (id, options) {
                options = options || {};
                var comp = context.getComponentForActivePage(id);
                if (!comp) return null;
                if (options.watch === true) {
                    // We attach a change listener to the component as we assume we are
                    // dependent on it since we needed it to render the component.
                    // TODO: Declare a more precise dependency in component config.
                    if (!self.getPageComponent._listeners) {
                        self.getPageComponent._listeners = {};
                    }
                    if (!self.getPageComponent._listeners[id]) {
                        self.getPageComponent._listeners[id] = function (event) {
                            self.emit("changed", event);
                        }
                        comp.on("changed", self.getPageComponent._listeners[id]);
                    }
                }
                return comp;
            }
            self.getPageComponentsForPrefix = function (prefix) {
                var components = {};
                context.getComponentIdsForPrefixForActivePage(prefix).forEach(function (id) {
                    components[id] = self.getPageComponent(id);
                });
                return components;
            }
            
            self.getDomNode = function () {
                return componentConfig.domNode;
            }
            
            self.getPageContext = function () {
                return context.contexts.container.getPageContext();
            }

            // An API the component may expose for access by other components on the same page
            self.pageAPI = {};

            // The template for the component
            self.template = null;

            // The various component methods
            self.implAPI = {
                dataConsumer: null
            };

            // NOTE: This IMMUTABLE object gets passed around and will have new data assigned when available
            //       thus anyone with a reference will have access to the new data.
            // TODO: Make immutable.
            self.dataObject = {};


            self.setData = function (data, skipNotify) {
                var dataBefore = {};
                // Re-assign all data keys so anyone with already a reference to 'self.dataObject' gets updates.
                Object.keys(self.dataObject).forEach(function (name) {
                    dataBefore[name] = self.dataObject[name];
                    delete self.dataObject[name];
                });

                function flattenDataObject (dataObject) {
                    // We remove all 'get' indirection and return a plain JS / JSONifiable object
                    var data = LIB._.cloneDeep(dataObject);
                    LIB.traverse(data).forEach(function () {
                        // TODO: Flatten the various record types.
					    if (
					        typeof this.node === "object" &&
					        this.node.attributes &&
					        this.node.collection &&
					        this.node.collection._byId
					    ) {
					        this.parent.node[this.key] = {};
                            LIB._.assign(this.parent.node[this.key], this.node.attributes);
					    } else
						if (typeof this.node === "function") {
						    if (this.key === "get") {
                                delete this.parent.node.get;
                                LIB._.assign(this.parent.node, this.node("*"));
						    } else {
// TODO: Only log in debug mode.
//            							        console.log("Ignore function '" + this.key + "' at '" + this.path.join(".") + "' as we are only calling 'get' functions.");
						    }
						} else {
//            								LIB.traverse(data).set(this.path, this.node);
						}
					});
					return data;
                }

                LIB._.assign(self.dataObject, flattenDataObject(data));
console.log("setData() - SET NEW DATA!");
                if (skipNotify) {
console.log("SKIP DATA NOTIFY!");                                
                    return;
                }
                self.emit("changed", {
                    reason: "data",
                    component: self.id,
                    before: dataBefore,
                    after: self.dataObject
                });
            }

            self.callServerAction = function (action, payload) {

                // TODO: Support different request formatters.
                // TODO: Let mapper parse and act on response.

                var uri = self.implAPI.resolveActionUri(context.contexts.page.getPath(), componentConfig.id, componentConfig.impl);

                return context.contexts.adapters.request.window.postJSON(uri, {}, {
                    action: action,
                    payload: payload
                }).then(function(response) {
        			if (response.status !== 200) {
        				var err = new Error("Error making request to '" + uri + "'");
        				err.code = response.status;
        				throw err;
        			}
        			return response.json();
        		}).then(function (data) {

        		    // See if there is new data to merge into the collections
        		    if (data.collections) {
        			    Object.keys(data.collections).forEach(function (collectionName) {
        			        var collection = context.contexts.data.getCollection(collectionName);
        			        if (!collection) {
        			            // TODO: Optionally just issue warning
        			            throw new Error("Collection with name '" + collectionName + "' needed to store fetched data not found!");
        			        }
        			        var add = [];
        			        var remove = [];
        			        data.collections[collectionName].forEach(function (record) {
        			            if (Object.keys(record).length === 1) {
        			                remove.push(record);
        			            } else {
        			                record.id = parseInt(record.id);
        			                add.push(record);
        			            }
        			        });
        			        if (remove.length > 0) {
                    			collection.store.remove(remove);
        			        }
        			        if (add.length > 0) {
                    			collection.store.add(add, {
                    			    merge: true
                    			});
        			        }
        			    });
        		    }

        		    return data.result || null;
        		});
            }

            self.getDataForPointer = function (pointer) {

                // TODO: Support different request and response formatters.

                var uri = self.implAPI.resolveDataUri(context.contexts.page.getPath(), componentConfig.id, componentConfig.impl) + "/" + pointer;

                return context.contexts.adapters.request.window.get(uri, {}).then(function(response) {
        			if (response.status !== 200) {
        				var err = new Error("Error making request to '" + uri + "'");
        				err.code = response.status;
        				throw err;
        			}
        			return response.json();
        		});
            }

            self.destroy = function () {
                if (self.implAPI.dataConsumer) {
                    self.implAPI.dataConsumer.removeAllListeners();
                }
                self.emit("destroy");
                self.removeAllListeners();
            }
        }
        ComponentContext.prototype = Object.create(LIB.EventEmitter.prototype);
        ComponentContext.prototype.contexts = context.contexts;


        return {
            ComponentContext: ComponentContext
        };
    }

    return exports;
}
