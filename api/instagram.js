const axios = require('axios');
const https = require('https');
const UserAgent = require('user-agents');


function parseData(data){

    let instagramData = data.split("window._sharedData = ")[1].split("<\/script>")[0].slice(0, -1);
    
    instagramData = JSON.parse(instagramData);            
    instagramData = instagramData.entry_data.ProfilePage[0].graphql.user;

    return instagramData;

}

function getCaption(post){

    if(post.edge_media_to_caption.edges && post.edge_media_to_caption.edges[0]){
        return post.edge_media_to_caption.edges[0].node.text;
    }
   
    if(post.accessibility_caption){
        return post.accessibility_caption;
    }

    return false;
}

function getPostImageUrlAndType(post){

    let type, imageUrl;

    switch(post.__typename){              
        
        case "GraphVideo":
            type = 'video';
            imageUrl = post.thumbnail_src
        break;

        default:
            type= 'image';
            imageUrl = post.thumbnail_resources[3].src;
        break;
    }

    return { type, imageUrl }

}


module.exports = async (request, response) => { 

    const { username = 'facebook' } = request.query;
    let instagramResponse;
    
    try{

        const userAgent = new UserAgent({ deviceCategory: "desktop"}).toString();

        instagramResponse = await axios.get(`https://instagram.com/${username}`, {
            headers: { 'User-Agent': userAgent },             
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });

    } catch(exception){

        if(exception.response.status == 404){
            response.status(404).json({
                success : false,
                status  : 'error',
                message : 'This account has not found on Instagram.'            
            });
        } else {

            console.log(exception.response.data);

            response.status(500).json({
                success : false,
                status  : 'error',
                message : 'Some error ocour while processing request. Please tray again in few moments.'            
            });
        }
        
        return;

    }

    const instagramData = parseData(instagramResponse.data);
    const { full_name: fullName, is_private: privateInstagramProfile} = instagramData;
    
    if(privateInstagramProfile){

        response.status(200).json({
            success : false,
            status  : 'error',
            message : 'This profile is private.'            
        });

        return;

    } 

    const posts = await Promise.all(instagramData.edge_owner_to_timeline_media.edges.slice(0, 6).map(async ({node: post}, index) => {

        const postUrl = `https://www.instagram.com/p/${post.shortcode}`;
        const caption = getCaption(post);
        const {type, imageUrl} = getPostImageUrlAndType(post);        

        try{
           
            const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const imageData = `data:${imageResponse.headers['content-type']};base64,${Buffer.from(String.fromCharCode(...new Uint8Array(imageResponse.data)), 'binary').toString('base64')}`;

            return {
                type,
                postUrl,
                caption,
                imageData
            }
        
        } catch(exception){}        

    }));

    parsedInfo = {
        success : true,
        profile : { username, fullName },            
        posts   : posts.filter((post) => post)
    }

    response.setHeader('Cache-Control', 'max-age=0, s-maxage=86400');
    response.status(200).json(parsedInfo);

}