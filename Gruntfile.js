/*jslint node: true */
'use strict';

var pkg = require('./package.json');

//Using exclusion patterns slows down Grunt significantly
//instead of creating a set of patterns like '**/*.js' and '!**/node_modules/**'
//this method is used to create a set of inclusive patterns for all subdirectories
//skipping node_modules, bower_components, dist, and any .dirs
//This enables users to create any directory structure they desire.
var createFolderGlobs = function (fileTypePatterns) {
    fileTypePatterns = Array.isArray(fileTypePatterns) ? fileTypePatterns : [fileTypePatterns];
    var ignore = ['node_modules', 'bower_components', 'dist', 'temp'];
    var fs = require('fs');
    return fs.readdirSync(process.cwd())
        .map(function (file) {
            if (ignore.indexOf(file) !== -1 ||
                file.indexOf('.') === 0 || !fs.lstatSync(file).isDirectory()) {
                return null;
            } else {
                return fileTypePatterns.map(function (pattern) {
                    return file + '/**/' + pattern;
                });
            }
        })
        .filter(function (patterns) {
            return patterns;
        })
        .concat(fileTypePatterns);
};

var dashToCamel = function (name) {
    return name.replace(/\W+(.)/g, function (x, chr) {
        return chr.toUpperCase();
    });
};

module.exports = function (grunt) {

    // load all grunt tasks
    require('load-grunt-tasks')(grunt);

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        connect: {
            main: {
                options: {
                    port: 9000,
                    base: ['test','src']
                }
            }
        },
        watch: {
            main: {
                options: {
                    livereload: true,
                    livereloadOnError: false,
                    spawn: false
                },
                files: [createFolderGlobs(['*.js', '*.less', '*.html']), '!_SpecRunner.html', '!.grunt'],
                tasks: [] //all the tasks are run dynamically during the watch event handler
            }
        },
        jshint: {
            main: {
                options: {
                    jshintrc: 'test/.jshintrc'
                },
                src: createFolderGlobs(['src/**/*.js','test/**/*-spec.js'])
            }
        },
        clean: {
            before: {
                src: ['dist', 'temp']
            },
            after: {
                src: ['temp']
            }
        },
        less: {
            production: {
                options: {
                },
                files: {
                    'temp/app.css': 'app.less'
                }
            }
        },
        copy: {
            main: {
                files: [
                    {src: ['img/**'], dest: 'dist/'},
                    {src: ['bower_components/font-awesome/fonts/**'], dest: 'dist/', filter: 'isFile', expand: true},
                    {src: ['bower_components/bootstrap/fonts/**'], dest: 'dist/', filter: 'isFile', expand: true},
                    //{src: ['bower_components/select2/*.png','bower_components/select2/*.gif'], dest:'dist/css/',flatten:true,expand:true},
                ]
            }
        },
        dom_munger: {
            read: {
                options: {
                    read: [
                        {selector: 'script[data-concat!="false"]', attribute: 'src', writeto: 'appjs'},
                        {selector: 'link[rel="stylesheet"][data-concat!="false"]', attribute: 'href', writeto: 'appcss'}
                    ]
                },
                src: 'test/unittester.html'
            }
        },
        cssmin: {
            main: {
                src: ['temp/app.css'],
                dest: 'dist/app.full.min.css'
            }
        },
        concat: {
            main: {
                src: ['<%= dom_munger.data.appjs %>'],
                dest: 'dist/launchpadAPI.js'
            }
        },
        uglify: {
            main: {
                src: 'dist/launchpadAPI.js',
                dest: 'dist/launchpadAPI.min.js'
            }
        },
        htmlmin: {
            main: {
                options: {
                    collapseBooleanAttributes: true,
                    collapseWhitespace: true,
                    removeAttributeQuotes: true,
                    removeComments: true,
                    removeEmptyAttributes: true,
                    removeScriptTypeAttributes: true,
                    removeStyleLinkTypeAttributes: true
                },
                files: {
                    'dist/index.html': 'dist/index.html'
                }
            }
        },
        //Imagemin has issues on Windows.
        //To enable imagemin:
        // - "npm install grunt-contrib-imagemin"
        // - Comment in this section
        // - Add the "imagemin" task after the "htmlmin" task in the build task alias
        // imagemin: {
        //   main:{
        //     files: [{
        //       expand: true, cwd:'dist/',
        //       src:['**/{*.png,*.jpg}'],
        //       dest: 'dist/'
        //     }]
        //   }
        // },
        karma: {
            options: {
                frameworks: ['jasmine'],
                preprocessors: {
                  'src/**/*.js': ['coverage'],
                },
                files: [  //this files data is also updated in the watch handler, if updated change there too
                    '<%= dom_munger.data.appjs %>',
                    '**/*.html',
                    createFolderGlobs('test/**/*-spec.js')
                ],
                logLevel: 'ERROR',
                reporters: ['mocha', 'coverage'],
                autoWatch: false, //watching is handled by grunt-contrib-watch
                singleRun: true
            },
            all_tests: {
                browsers: ['PhantomJS']
            },
            during_watch: {
                browsers: ['PhantomJS']
            }
        }
    });

    grunt.registerTask('build', ['jshint', 'clean:before', 'dom_munger', 'karma:all_tests', 'concat', 'uglify', 'clean:after']);
    grunt.registerTask('serve', ['dom_munger:read', 'jshint', 'connect', 'watch']);
    grunt.registerTask('test', ['dom_munger:read', 'jshint', 'karma:all_tests']);
    grunt.registerTask('rename-npm-config', function (name) {
        var npmConfigPath = 'package.json';
        var npmConfig = grunt.file.readJSON(npmConfigPath);

        npmConfig.name = name;
        grunt.file.write(npmConfigPath, JSON.stringify(npmConfig, null, 2));
        grunt.config.set('pkg', grunt.file.readJSON(npmConfigPath));
    });
    grunt.registerTask('rename', function (name) {
        grunt.task.run('rename-npm-config:' + dashToCamel(name));
    });

    grunt.event.on('watch', function (action, filepath) {
        //https://github.com/gruntjs/grunt-contrib-watch/issues/156

        var tasksToRun = [];

        if (filepath.lastIndexOf('.js') !== -1 && filepath.lastIndexOf('.js') === filepath.length - 3) {

            //lint the changed js file
            grunt.config('jshint.main.src', filepath);
            tasksToRun.push('jshint');

            //find the appropriate unit test for the changed file
            var spec = filepath;
            if (filepath.lastIndexOf('-spec.js') === -1 || filepath.lastIndexOf('-spec.js') !== filepath.length - 8) {
                spec = filepath.substring(0, filepath.length - 3) + '-spec.js';
            }

            //if the spec exists then lets run it
            if (grunt.file.exists(spec)) {
                var files = [].concat(grunt.config('dom_munger.data.appjs'));
                files.push(spec);
                grunt.config('karma.options.files', files);
                tasksToRun.push('karma:during_watch');
            }
        }

        //if index.html changed, we need to reread the <script> tags so our next run of karma
        //will have the correct environment
        if (filepath === 'test/index.html') {
            tasksToRun.push('dom_munger:read');
        }

        grunt.config('watch.main.tasks', tasksToRun);

    });
};
