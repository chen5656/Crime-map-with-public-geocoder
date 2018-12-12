var input = document.getElementById("input");
var processor = document.getElementById("processor");
var output = document.getElementById("map");
var geoCodeResult = "Unknown issue of reading data from pdf. Please refresh the main page.";

function showGeocodeResult() {
  //show geocoding report
  var win = window.open("", "Title", "toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=780,height=200,top=" + (screen.height - 400) + ",left=" + (screen.width - 840));
  win.document.body.innerHTML = geoCodeResult;
}

//get crime data from pdf
window.addEventListener("message", function (event) {
  if (event.source != processor.contentWindow) return;

  switch (event.data) {
    case "ready":
      var xhr = new XMLHttpRequest;
      xhr.open('GET', input.getAttribute("src"), true);
      xhr.responseType = "arraybuffer";
      xhr.onload = function (event) {
        processor.contentWindow.postMessage(this.response, "*");
      };
      xhr.send();
      break;
    default:
      geocoderRequest(getCrimeList(event.data));
      break;
  }
}, true);

function getCrimeList(data) {
  var newArr = [];
  var arr = data.split(/\n/).filter(function (val) {
    return val.length > 1;
  });
  for (var i = 0; i < arr.length; i++) {
    if (Date.parse(arr[i])) {
      newArr.push({
        "crimeDate": arr[i],
        "crimeAddress": arr[i + 1],
        "crimeType": arr[i + 2]
      });
      i = i + 2;
    }
  }
  return newArr;
}

function geocoderRequest(crimeList) {

  var crimeFeatures = [];
  var noMatchedAddress = [];

  // geocode Crime With Google Api
  console.log('Geocoding ', crimeList.length, ' items...');
  crimeList.forEach(function (crime) {
    geocoderOneAddress(crime, crimeList.length);
  });


  function geocoderOneAddress(crimeItem, crimeCount) {
    var apiKey = "AIzaSyAFZa0Ow-WOFawChIn-dyLR-Hm_RoTuE9I";
    httpGetAsync('https://maps.googleapis.com/maps/api/geocode/json?address=' + crimeItem.crimeAddress.replace(/\ /g, '+') + ',75048&key=' + apiKey,
      function (json) {
        var results = JSON.parse(json).results;
        if (results.length > 0) {

          crimeItem.matchedAddressCount = results.length;
          crimeItem.matchedAddress = results[0].formatted_address;
          crimeItem.geometry = results[0].geometry;
          crimeItem.matchedAddressCount = results.length;
          crimeItem.matchedAddress = results[0].formatted_address;
          crimeFeatures.push(crimeItem);
        } else {
          crimeItem.matchedAddressCount = 0;
          noMatchedAddress.push(crimeItem);
        }
        if ((crimeFeatures.length + noMatchedAddress.length) == crimeCount) {
          console.log('Adding to map...');

          displayMap(crimeFeatures);

          var noMatchList = noMatchedAddress.map(function (item) {
            return item.crimeAddress;
          }).sort().join("</li><li>");
          console.log("crimeFeatures:", crimeFeatures);
          console.log("noMatchedAddress:", noMatchedAddress);

          geoCodeResult = "<h5>Total " + crimeCount + " crimes.</h5>" +
            "<h5>" + crimeFeatures.length + " crimes have been added to the map.</h5>" +
            "<h5>The following " + noMatchedAddress.length + " crime(s) cannot be geocoded.</h5>" +
            "<ul><li>" + noMatchList + "</li></ul>";

        }

      });

    function httpGetAsync(theUrl, callback) {
      var xmlHttp = new XMLHttpRequest();
      xmlHttp.onreadystatechange = function () {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200)
          callback(xmlHttp.responseText);
      }
      xmlHttp.open("GET", theUrl, true); // true for asynchronous 
      xmlHttp.send(null);
    }

  }
}

function displayMap(geocodedCrimeList) {
  require([
    'esri/Map',
    'esri/views/MapView',
    "esri/request",

    "esri/Graphic",
    "esri/layers/FeatureLayer",
    "esri/geometry/Point",
    "esri/widgets/Legend",

    'dojo/on',
    'dojo/dom',
    'dojo/_base/array',
    "dojo/_base/lang", "dojo/promise/all", "dojo/topic",

    'dojo/domReady!'
  ], function (
    Map, MapView, esriRequest,
    Graphic, FeatureLayer, Point, Legend,
    ImportAddress,
    on, dom, array,
    lang, all, topic
  ) {
    var crimeLayer;
    /**************************************************
     * Create the map and view
     **************************************************/
    console.log('Adding basemap...');

    var map = new Map({
      basemap: 'topo'
    });

    var view = new MapView({
      container: 'mapid',
      map: map,
      zoom: 13,
      center: [-96.58, 32.96]
    });

    var cityBoundary = new FeatureLayer({ //MAP SERVICE hosted by TxDOT open data  
      url: "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_City_Boundaries/FeatureServer/0/query?outFields=*&where=1%3D1",
      definitionExpression: "CITY_NM = 'Sachse'",
      opacity: 0.8
    });
    map.add(cityBoundary);

    console.log('Adding crime layer...');

    addToMap(geocodedCrimeList);

    function addToMap(array) {
      var featureset = array.map(function (feature, i) {
        return {
          geometry: new Point({
            x: feature.geometry.location.lng,
            y: feature.geometry.location.lat
          }),
          attributes: {
            ObjectID: i,
            Date: feature.crimeDate,
            Address: feature.crimeAddress,
            Catagory: feature.crimeType
          }
        }
      });
      var fields = [{
        name: "ObjectID",
        alias: "ObjectID",
        type: "oid"
      }, {
        name: "Catagory",
        alias: "Catagory",
        type: "string"
      }, {
        name: "Address",
        alias: "Address",
        type: "string"
      }, {
        name: "Date",
        alias: "Date",
        type: "string"
      }];
      var pTemplate = {
        title: "{Catagory}",
        content: "Crime happened at <b>{Address}</b> on <b>{Date}</b>."
      };
      var crimeTypeList = {}; //get count of each crime type      
      for (var i = 0; i < array.length; i++) {
        if (crimeTypeList[array[i].crimeType] > 0) {
          crimeTypeList[array[i].crimeType]++;
        } else {
          crimeTypeList[array[i].crimeType] = 1;
        }
      }

      var mostFiveCatagory = [];
      mostFiveCatagory = Object.keys(crimeTypeList).map(function (key) {
        return {
          "name": key,
          "count": crimeTypeList[key]
        };
      }).sort(function (a, b) {
        return b.count - a.count
      }).slice(0, 5);

      var uniqueValueList = [];
      var otherCrimeCount = array.length;
      var colorList = ["#3366ff", "#009999", "#cccc00", "#cc66ff", "#00cc00"];
      uniqueValueList = mostFiveCatagory.map(function (catagory, i) {
        otherCrimeCount = otherCrimeCount - catagory.count;
        return {
          value: catagory.name,
          label: catagory.name + " (" + catagory.count + ")",
          symbol: {
            type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
            size: 6,
            color: colorList[i],
            outline: { // autocasts as new SimpleLineSymbol()
              width: 0.5,
              color: "white"
            }
          }
        };
      });

      var renderer = {
        type: "unique-value", // autocasts as new SimpleRenderer()
        field: "Catagory",
        defaultSymbol: {
          type: "simple-marker", // autocasts as new SimpleMarkerSymbol()
          size: 6,
          color: "#001a00",
          outline: { // autocasts as new SimpleLineSymbol()
            width: 0.5,
            color: "white"
          }
        },
        defaultLabel: "Other crimes" + " (" + otherCrimeCount + ")",
        uniqueValueInfos: uniqueValueList,
        legendOptions: {
          title: "Most happend crimes"
        }
      };
      crimeLayer = new FeatureLayer({
        source: featureset, // autocast as an array of esri/Graphic
        // create an instance of esri/layers/support/Field for each field object
        fields: fields, // This is required when creating a layer from Graphics
        objectIdField: "ObjectID", // This must be defined when creating a layer from Graphics
        renderer: renderer, // set the visualization on the layer
        popupTemplate: pTemplate
      });

      map.add(crimeLayer);
    }

    console.log('Adding legend...');
    var legend = new Legend({
      view: view,
      layerInfos: [{
        layer: crimeLayer,
        title: "Crimes in Sachse"
      }]
    });
    view.ui.add(legend, "bottom-right");

  });
}