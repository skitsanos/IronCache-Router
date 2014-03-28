/**
 * IronCache Router for Microsoft IIS 7.5
 * Created by skitsanos on 28/02/2014.
 */

var http = require('http');
var url = require('url');

http.createServer(function (request, response)
{
	var urlParts = url.parse(request.url, true);
	var urlRoute = urlParts.path.split('/')[1];

	var options = {
		hostname: null,
		port: 80,
		path: urlParts.path,
		method: request.method,
		headers: {}
	};

	switch (urlRoute)
	{
		//support for jsonbridge:
		case 'jsonbridge':
			options.hostname = 'jsonbridge.mywdk.com';
			break;

		//support for iron.io tunneling:
		case 'ironio-cache':
			options.hostname = 'cache-aws-us-east-1.iron.io';
			options.headers = {'Content-Type': 'application/json'};
			options.path = urlParts.path.substring(urlRoute.length + 1);
			console.log('-- Tunneling to: ' + options.hostname + options.path);
			break;

		//support for iron.io tunneling via remapping request:
		case 'ironio-cache-mapped':
			/**
			 * increment: /ironio-cache-mapped/projects/{Project ID}/caches/{Cache Name}/items/{Key}/increment?oauth=&value
			 * - maps to POST with manual override on body {"amount": %%value}
			 *
			 * put: /ironio-cache-mapped/projects/{Project ID}/caches/{Cache Name}/items/{Key}?oauth=&value=
			 * - maps to PUT with manual override on body {"value": %%value}
			 *
			 * get: /ironio-cache-mapped/projects/{Project ID}/caches/{Cache Name}/items/{Key}?oauth=
			 * - maps into GET as is
			 */
			var command = urlParts.path.split('/')[2];
			console.log('COMMAND: ' + command);
			options.path = urlParts.path.substring(urlRoute.length + command.length + 2);

			switch (command.toLowerCase())
			{
				case 'increment':
					options.method = 'POST';
					options.path = options.path.replace('?oauth', '/increment?oauth');
					options.requestBody = JSON.stringify({amount: Number(urlParts.query.value)});
					break;

				case 'get':
					options.method = 'GET';
					break;

				case 'put':
					options.method = 'PUT';
					options.requestBody = JSON.stringify({value: Number(urlParts.query.value)});
					break;
			}
			options.hostname = 'cache-aws-us-east-1.iron.io';
			options.headers = {'Content-Type': 'application/json'};
			console.log('-- Tunneling to: ' + options.hostname + options.path);
			break;
	}

	//console.log('STATUS: ' + response.statusCode);
	//console.log('request: ' + options.path);
	console.log(JSON.stringify(options));

	if (options.hostname == null)
	{
		var bodyEmpty = JSON.stringify({status: 200, path: options.path});
		response.writeHead(200, {
			'Content-Length': bodyEmpty.length,
			'Content-Type': 'application/json' });
		response.write(bodyEmpty);
		response.end();
	}
	else
	{
		//options.headers = {'Authorization': 'Simple demo:demo'};

		var requestProxy = http.request(options, function (proxyResponse)
		{
			console.log('STATUS: ' + proxyResponse.statusCode);
			console.log('HEADERS: ' + JSON.stringify(proxyResponse.headers));
		});

		requestProxy.addListener('response', function (proxy_response)
		{
			proxy_response.addListener('data', function (chunk)
			{
				response.write(chunk, 'binary');
			});
			proxy_response.addListener('end', function ()
			{
				response.end();
			});
			response.writeHead(proxy_response.statusCode, proxy_response.headers);
		});

		var body = '';
		request.addListener('data', function (chunk)
		{
			body += chunk;
			requestProxy.write(chunk, 'binary');
		});

		request.addListener('end', function ()
		{
			console.log('BODY: ' + body);
			requestProxy.end();
		});

		//override what we send to the end point after remapping request
		if (urlRoute == 'ironio-cache-mapped' && options.method != 'GET')
		{
			requestProxy.write(options.requestBody);
			requestProxy.end();
		}

	}
}).listen(process.env.PORT || process.env.VMC_APP_PORT || 1337, null);
