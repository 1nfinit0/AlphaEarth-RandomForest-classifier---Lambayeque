// CÓDIGO MODIFICADO PARA INCLUIR MÉTRICAS DE PRECISIÓN

var dataset = ee.ImageCollection("GOOGLE/SATELLITE_EMBEDDING/V1/ANNUAL")
  .filterDate('2024-01-01', '2024-01-02')
  .filterBounds(aoiLambayeque);

var imageAlpha = dataset.mosaic().clip(aoiLambayeque);

var samples = imageAlpha.sampleRegions({
  collection: etiquetas,   
  properties: ['clase'],          
  scale: 20,                      
});

// ============= MODIFICACIÓN 1: DIVISIÓN DE DATOS =============
// Dividir las muestras en entrenamiento (70%) y validación (30%)
var withRandom = samples.randomColumn('random');
var split = 0.7;  // 70% para entrenamiento, 30% para validación
var trainingSamples = withRandom.filter(ee.Filter.lt('random', split));
var validationSamples = withRandom.filter(ee.Filter.gte('random', split));

print('Total de muestras:', samples.size());
print('Muestras de entrenamiento:', trainingSamples.size());
print('Muestras de validación:', validationSamples.size());

// ============= MODIFICACIÓN 2: ENTRENAR CON SUBSET =============
var classifier = ee.Classifier.smileRandomForest(200).train({
  features: trainingSamples,  // Usar solo datos de entrenamiento
  classProperty: 'clase',
  inputProperties: imageAlpha.bandNames()
});

// ============= MODIFICACIÓN 3: VALIDACIÓN Y MÉTRICAS =============
// Clasificar las muestras de validación
var validation = validationSamples.classify(classifier);

// Calcular matriz de confusión
var confusionMatrix = validation.errorMatrix('clase', 'classification');

// Calcular métricas principales
var overallAccuracy = confusionMatrix.accuracy();
var kappa = confusionMatrix.kappa();
var consumersAccuracy = confusionMatrix.consumersAccuracy();
var producersAccuracy = confusionMatrix.producersAccuracy();

// ============= IMPRIMIR RESULTADOS =============
print('=== MÉTRICAS DE PRECISIÓN DEL MODELO ===');
print('Matriz de Confusión:', confusionMatrix);
print('Precisión Global (%):', overallAccuracy.multiply(100));
print('Coeficiente Kappa:', kappa);
print('Precisión del Usuario por clase (%):', consumersAccuracy.multiply(100));
print('Precisión del Productor por clase (%):', producersAccuracy.multiply(100));

// Calcular métricas adicionales
var order = ['0', '1'];  // Orden de las clases: 0=No Agrícola, 1=Agrícola
var array = confusionMatrix.array();

// Extraer valores de la matriz de confusión
var tn = array.get([0, 0]);  // True Negative (No Agrícola correcta)
var fp = array.get([0, 1]);  // False Positive (No Agrícola clasificada como Agrícola)
var fn = array.get([1, 0]);  // False Negative (Agrícola clasificada como No Agrícola)
var tp = array.get([1, 1]);  // True Positive (Agrícola correcta)

// Calcular F1-Score para cada clase
var precisionNoAgricola = tn.divide(tn.add(fp));
var recallNoAgricola = tn.divide(tn.add(fn));
var f1NoAgricola = precisionNoAgricola.multiply(recallNoAgricola).multiply(2)
  .divide(precisionNoAgricola.add(recallNoAgricola));

var precisionAgricola = tp.divide(tp.add(fp));
var recallAgricola = tp.divide(tp.add(fn));
var f1Agricola = precisionAgricola.multiply(recallAgricola).multiply(2)
  .divide(precisionAgricola.add(recallAgricola));

print('=== MÉTRICAS DETALLADAS ===');
print('F1-Score Clase No Agrícola:', f1NoAgricola);
print('F1-Score Clase Agrícola:', f1Agricola);

// Error de omisión y comisión
var omissionErrorNoAgricola = fn.divide(tn.add(fn)).multiply(100);
var commissionErrorNoAgricola = fp.divide(tn.add(fp)).multiply(100);
var omissionErrorAgricola = fn.divide(tp.add(fn)).multiply(100);
var commissionErrorAgricola = fp.divide(tp.add(fp)).multiply(100);

print('=== ERRORES POR CLASE ===');
print('Error de Omisión No Agrícola (%):', omissionErrorNoAgricola);
print('Error de Comisión No Agrícola (%):', commissionErrorNoAgricola);
print('Error de Omisión Agrícola (%):', omissionErrorAgricola);
print('Error de Comisión Agrícola (%):', commissionErrorAgricola);

// ============= APLICAR CLASIFICACIÓN A TODA EL ÁREA =============
var classified = imageAlpha.classify(classifier);

// ============= VISUALIZACIÓN =============
var sentinel = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterDate('2024-01-01', '2024-01-02')
  .filterBounds(aoiLambayeque);
  
var visParamsSentinel = {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 3000,
  gamma: 1.2
};

var imageSentinel = sentinel.mosaic().clip(aoiLambayeque);

// Agregar capas al mapa
Map.addLayer(imageSentinel, visParamsSentinel, 'Sentinel-2');
Map.addLayer(classified, {min:0, max:1, palette:['red','green']}, 'Clasificación');

// Visualizar muestras de entrenamiento y validación
Map.addLayer(trainingSamples, {color: 'blue'}, 'Muestras Entrenamiento');
Map.addLayer(validationSamples, {color: 'yellow'}, 'Muestras Validación');

// ============= ESTADÍSTICAS DE ÁREA =============
// Calcular área por clase
var areaImage = classified.multiply(ee.Image.pixelArea());

var areaAgricola = areaImage.select('classification')
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: aoiLambayeque,
    scale: 20,
    maxPixels: 1e9
  });

var areaTotal = ee.Image.pixelArea()
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: aoiLambayeque,
    scale: 20,
    maxPixels: 1e9
  });

print('=== ESTADÍSTICAS DE ÁREA ===');
print('Área total (hectáreas):', areaTotal.get('area').divide(10000));
print('Área agrícola (hectáreas):', areaAgricola.get('classification').divide(10000));

// Calcular porcentajes
var porcentajeAgricola = areaAgricola.get('classification')
  .divide(areaTotal.get('area')).multiply(100);
var porcentajeNoAgricola = ee.Number(100).subtract(porcentajeAgricola);

print('Porcentaje de cobertura agrícola (%):', porcentajeAgricola);
print('Porcentaje de cobertura no agrícola (%):', porcentajeNoAgricola);

Map.centerObject(aoiLambayeque, 11);

// ============= EXPORTAR RESULTADOS =============
// Descomentar para exportar la clasificación
/*
Export.image.toDrive({
  image: classified,
  description: 'Clasificacion_AlphaEarth_Lambayeque_2024',
  folder: 'GEE_Exports',
  region: aoiLambayeque,
  scale: 20,
  crs: 'EPSG:4326',
  maxPixels: 1e9
});
*/

// // Exportar tabla con métricas de precisión
// var metricsTable = ee.FeatureCollection([
//   ee.Feature(null, {
//     'metrica': 'Precision_Global',
//     'valor': overallAccuracy.multiply(100)
//   }),
//   ee.Feature(null, {
//     'metrica': 'Coeficiente_Kappa',
//     'valor': kappa
//   })
// ]);

/*
Export.table.toDrive({
  collection: metricsTable,
  description: 'Metricas_Precision_Modelo',
  folder: 'GEE_Exports',
  fileFormat: 'CSV'
});
*/