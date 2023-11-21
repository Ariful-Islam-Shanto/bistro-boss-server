const express = require('express');
const cors = require('cors');
var jwt = require('jsonwebtoken');
// var cookieParser = require('cookie-parser');
const app = express();
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;



//middleware
app.use(cors());
app.use(express.json());
// app.use(cookieParser());


app.get('/', async(req, res) => {
    res.send(`Server is runnig on port ${port}`);
})



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const e = require('express');
const uri = `mongodb+srv://${process.env.USER_DB}:${process.env.USER_PASS}@cluster0.agg5tyw.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const database = client.db('bistroDB');
const menuCollection = database.collection('menu')
const userCollection = database.collection('users')
const reviewsCollection = database.collection('reviews')
const cartCollection = database.collection('cart')
const paymentsCollection = database.collection('payments')

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const verifyToken = (req, res, next) => {
      const headers = req.headers;
      
      //? check if their is header
      if(!headers.authorization) {
        return res.status(401).send({message : 'unauthorized access'})
      }
      //? Their is headers then split the header from Bearer and take the token.
      const token = headers.authorization.split(' ')[1];
      // console.log(token, 'token');
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if(err) {
          return res.status(401).send({message : 'unauthorized access'})
        }
        req.decoded = decoded;
        next();
      })
    }


    //? After verify token is the api is admin related then make sure the 
    //? User is admin. By this verifyAdmin middleware.
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email : email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'Admin';
      if(!isAdmin) {
        return res.status(403).send({message : 'unauthorized'});
      }
      next();
    }


    //? Auth Api
    app.post('/jwt', async(req, res) => {
      const user = req.body;
      const secret = process.env.ACCESS_TOKEN_SECRET;

      const token = jwt.sign(user, secret, {expiresIn : '1h'});
      // console.log('Token', Token);
      // res.cookie('token', Token).send({success : true});
      //? Saving the token to local Storage.
      res.send({token})
    })

    //? Food Service and user management api.

    app.get('/menu', async(req, res) => {
        const cursor = menuCollection.find();
        const result = await cursor.toArray();
        res.send(result);
    })

    app.get('/menuById/:id', async(req, res) => {
        const id = req.params.id;
        console.log(id);
        const query = { _id : new ObjectId(id)}
        const result = await menuCollection.findOne(query);
        res.send(result);
        console.log(result);
    })

    app.get('/allCarts', async(req, res) => {
      const email = req.query.email;
      const query = { email : email};
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/users',verifyToken, verifyAdmin, async(req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.get('/verifyAdmin', verifyToken, async(req, res) => {
      const email = req.query.email;
      console.log('emai', email);
      //? Check if the req email and token email match.
      if(!email === req.decoded.email ) {
        return res.status(403).send({message : 'forbidden Access'})
      }

      //? We find the valid user then send a res of the user role is admin or not.

      const query = {email : email};
      const user = await userCollection.findOne(query);
      let admin = false;

      if(user) {
        //? If user role is admin the variable will converted to true.
        admin = user?.role === 'Admin';
        console.log('admin', admin);
      }
      res.send({admin});
    })

    app.post('/users', async(req, res) => {
      const user = req.body;
      //? if user is exist in the data base already don't insert it twice.
      const email = user.email;
      const query = { email : email};

      const isExist = await userCollection.findOne(query);
      if(isExist) {
        return res.send({message : 'User already exists.'})
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })

    app.post('/cart', async (req, res) => {
        const cartItem = req.body;
        const result = await cartCollection.insertOne(cartItem);
        res.send(result);
    })

    app.post('/addItem',verifyToken, verifyAdmin, async( req, res) => {
       const menuItem = req.body;
       const result = await menuCollection.insertOne(menuItem);
       res.send(result);
    })

    app.patch('/updateRole/:id', async(req, res) => {
       const id = req.params.id;
       const filter = { _id : new ObjectId(id)};
       const updatedDoc = {
        $set : {
          role : 'Admin'
        }
       }
       const result = await userCollection.updateOne(filter, updatedDoc);
       res.send(result);
    })

    app.patch('/updateItem/:id', async (req, res) => {
      const id = req.params.id;
      const updatedItem = req.body;
      const filter = { _id : id};
      const updatedDoc = {
        $set : {
          ...updatedItem
        }
      }
      const result = menuCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })

    app.delete('/deleteCart', async(req, res) =>{
        const id = req.query.id;
        console.log(id);
        const query = { _id : new ObjectId(id)}
        const result = await cartCollection.deleteOne(query);
        res.send(result);
    })

    app.delete('/deleteUser/:id', async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    app.delete('/deleteMenuItem/:id', async(req, res) => {
      const id = req.params.id;
      const query = { _id : new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    })



    //? Stripe intent api

    app.post("/create-payment-intent", async(req, res) => {
      //? get the price from client side.
      const { price } = req.body;

      //? make it into cents
      const amount = parseInt(price * 100);

      //? Create a PaymentIntent with the order amount and currency and 
      //? payment type.
      const paymentIntent = await stripe.paymentIntents.create({
        amount : amount,
        currency : 'usd',
        payment_method_types: ["card"]
      }) 

      res.send({
        clientSecret : paymentIntent.client_secret,
      })
    })

    //? Store the payment info 
    app.post('/payments', async (req, res) => {

      //* save the payments into payment collection.
      const payment = req.body;
      const paymentResult = await paymentsCollection.insertOne(payment);

      //* then delete all the cart items that has been purchased.
      const query = { _id : {
        $in : payment.cartId.map(id => new ObjectId(id))
      }}

      const deleteCart = await cartCollection.deleteMany(query);

      res.send({paymentResult, deleteCart});
    })

    //? Get payment history.
    app.get('/paymentHistory',verifyToken, async(req, res) => {
      const email = req.query.email;
      const query = {email : email};
      
      // console.log('queryEmail', req.query.email, 'decoded email', req.decoded.email);

      if(req.query.email !== req.decoded.email) {
        return res.status(403).send({message : 'forbidden'})
      }

      const result = await paymentsCollection.find(query).toArray();
      res.send(result);
    })

    //? Stats and analytics
    app.get('/admin-stats', async(req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menus = await menuCollection.estimatedDocumentCount();
      const orders = await paymentsCollection.estimatedDocumentCount();

      //? aggregate Pipeline
      //* TODO : group all the value with id and calculate the sum.
      const result = await paymentsCollection.aggregate([
        {
          $group : {
            _id : null,
            totalRevenue : {
              $sum : '$price'
            }
          }
        }
      ]).toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({users, menus, orders, revenue});
    })
    
    //? Order stats using aggregate pipeline.
    //* TODO : Using pipeline getting specific category information.

    app.get('/order-stats', async(req, res) => {
      const result = await paymentsCollection.aggregate([

        //? Convert the menuId array values from string to Object Id.
        {
          $project: {
            convertedIds: {
              $map: {
                input: "$menuId",
                as: "menuId",
                in: { $toObjectId: "$$menuId" }
              }
            }
          }
        },

        //? Then separate every menuId value by _id from the menuId array.
        {
          $unwind: '$convertedIds'
        },

        //? Get data that matches with the menuId value in menuCollection.
        {
          $lookup : {
            from : 'menu',
            localField : 'convertedIds',
            foreignField : '_id',
            as : 'menuItems'
          }
        },

        //? Again make all menuItems value separate from the array.
        {
          $unwind : '$menuItems'
        },

        //? Now group the menuItems value by category and 
        //? For each category calculate the quantity,
        //? For each category calculate the total price.
        {
          $group : {
             _id : '$menuItems.category',
             quantity : { $sum : 1 },
             totalRevenue : { $sum : '$menuItems.price'}
          }
        },
        {
          $project :{
            _id : 0,
            category : '$_id',
            quantity : '$quantity',
            revenue : '$totalRevenue'
          }
        }

      ]).toArray();
      // console.log(result);
      res.send(result);
    })
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.listen(port, () => {
    console.log(`App is running on port ${port}`);
})